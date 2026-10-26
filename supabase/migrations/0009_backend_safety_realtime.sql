-- ============================================================================
-- 0009_backend_safety_realtime.sql
-- Fixes previos a staging:
--   - idempotencia real de eventos del conductor ante doble tap / retry móvil
--   - realtime reproducible para web apoderado
--   - coordenada del furgón sólo visible si está fresca
--   - grants defensivos para RPC SECURITY DEFINER
-- ============================================================================

-- Limpia duplicados históricos antes de crear índices únicos. En una BD que ya
-- tuvo el bug de doble tap/retry, CREATE UNIQUE INDEX abortaría sin esto.
-- Conserva el primer evento creado y elimina sólo repeticiones exactas del
-- mismo kind para la misma entidad de recorrido.
delete from public.trip_events a
using public.trip_events b
where a.trip_id = b.trip_id
  and a.student_id is not distinct from b.student_id
  and a.kind = b.kind
  and a.kind = 'approaching'
  and a.ctid > b.ctid;

-- Los eventos terminales son mutuamente excluyentes para un alumno dentro del
-- mismo recorrido. Si una BD vieja quedó con picked_up + skipped, dejamos el
-- primero creado y eliminamos el resto para que el índice parcial pueda crearse.
with ranked_terminal_events as (
  select
    ctid,
    row_number() over (
      partition by trip_id, student_id
      order by created_at asc, ctid asc
    ) as rn
  from public.trip_events
  where kind in ('picked_up', 'dropped_off', 'skipped')
)
delete from public.trip_events e
using ranked_terminal_events r
where e.ctid = r.ctid
  and r.rn > 1;

delete from public.trip_events a
using public.trip_events b
where a.trip_id = b.trip_id
  and a.student_id is null
  and b.student_id is null
  and a.kind = b.kind
  and a.kind in ('started', 'finished')
  and a.ctid > b.ctid;

-- Un único evento terminal por alumno dentro de un recorrido. Esto permite
-- usar ON CONFLICT de verdad en driver_mark_stop, sin race condition.
create unique index if not exists uq_trip_events_terminal
  on public.trip_events (trip_id, student_id)
  where kind in ('picked_up', 'dropped_off', 'skipped');

-- Evita duplicar eventos generales si hay reintentos.
create unique index if not exists uq_trip_events_started
  on public.trip_events (trip_id)
  where kind = 'started' and student_id is null;

create unique index if not exists uq_trip_events_finished
  on public.trip_events (trip_id)
  where kind = 'finished' and student_id is null;

create unique index if not exists uq_trip_events_approaching
  on public.trip_events (trip_id, student_id)
  where kind = 'approaching';

create or replace function public.driver_mark_stop(
  p_trip_id uuid,
  p_student_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_kind public.route_kind;
  v_event_kind public.trip_event_kind;
  v_event public.trip_events%rowtype;
  v_inserted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  if p_action not in ('completed', 'absent') then
    raise exception 'invalid_stop_action' using errcode = '22023';
  end if;

  if not public.is_my_trip(p_trip_id) then
    raise exception 'not_your_trip' using errcode = '42501';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'trip_not_found' using errcode = '02000';
  end if;
  if v_trip.status <> 'in_progress' then
    raise exception 'trip_not_in_progress' using errcode = '55000';
  end if;

  select kind into v_kind from public.routes where id = v_trip.route_id;

  if not exists (
    select 1
    from public.route_stops rs
    where rs.route_id = v_trip.route_id
      and rs.student_id = p_student_id
  ) then
    raise exception 'student_not_in_trip_route' using errcode = '42501';
  end if;

  if p_action = 'absent' then
    v_event_kind := 'skipped';
  elsif v_kind = 'AM' then
    v_event_kind := 'picked_up';
  else
    v_event_kind := 'dropped_off';
  end if;

  insert into public.trip_events (trip_id, student_id, kind)
  values (p_trip_id, p_student_id, v_event_kind)
  on conflict (trip_id, student_id) where kind in ('picked_up', 'dropped_off', 'skipped')
  do nothing
  returning * into v_event;

  v_inserted := v_event.id is not null;

  if not v_inserted then
    select * into v_event
    from public.trip_events
    where trip_id = p_trip_id
      and student_id = p_student_id
      and kind in ('picked_up', 'dropped_off', 'skipped')
    order by created_at asc
    limit 1;
  end if;

  delete from public.trip_stop_eta
  where trip_id = p_trip_id
    and student_id = p_student_id;

  return jsonb_build_object(
    'studentId', p_student_id,
    'event', v_event.kind,
    'direction', public.route_direction(v_kind),
    'createdAt', v_event.created_at,
    'idempotent', not v_inserted
  );
end;
$$;

-- Si el chofer cierra la app sin finalizar, no exponemos una coordenada vieja
-- congelada al apoderado. La fila puede quedar, pero sólo se lee fresca.
drop policy if exists trip_vehicle_location_guardian_select on public.trip_vehicle_location;
create policy trip_vehicle_location_guardian_select on public.trip_vehicle_location
  for select
  using (
    public.guardian_has_stop_in_trip(trip_id)
    and updated_at > now() - interval '2 minutes'
  );

grant select on public.trip_vehicle_location to authenticated;

-- Mantiene el mapa vivo de forma reproducible. En proyectos donde la tabla ya
-- estaba agregada desde el dashboard, el duplicate_object se ignora.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trip_vehicle_location;
  end if;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trip_stop_eta;
  end if;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trip_events;
  end if;
exception when duplicate_object then
  null;
end $$;

-- Defensa en profundidad: EXECUTE puede quedar concedido a PUBLIC por defecto
-- en Postgres. Las funciones igual validan auth.uid()/ownership internamente,
-- pero limitamos el permiso explícito al rol que corresponde.
revoke all on function public.route_direction(public.route_kind) from public;
revoke all on function public.driver_start_trip(uuid, date) from public;
revoke all on function public.driver_mark_stop(uuid, uuid, text) from public;
revoke all on function public.driver_finish_trip(uuid) from public;

grant execute on function public.route_direction(public.route_kind) to authenticated, anon;
grant execute on function public.driver_start_trip(uuid, date) to authenticated;
grant execute on function public.driver_mark_stop(uuid, uuid, text) to authenticated;
grant execute on function public.driver_finish_trip(uuid) to authenticated;
