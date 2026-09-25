-- ============================================================================
-- 0007_driver_api.sql
-- Contrato MVP: pantallas tontas -> driverApi/guardianApi -> RPC seguras.
--
-- AM se interpreta como ida (casa -> colegio) y PM como vuelta
-- (colegio -> casa). Las pantallas no deciden si una parada terminada es
-- picked_up o dropped_off: eso vive acá.
-- ============================================================================

create or replace function public.route_direction(p_kind public.route_kind)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_kind = 'AM' then 'to_school' else 'to_home' end;
$$;

create or replace function public.driver_start_trip(
  p_route_id uuid,
  p_trip_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_kind public.route_kind;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  if not public.is_my_route(p_route_id) then
    raise exception 'not_your_route' using errcode = '42501';
  end if;

  insert into public.trips (route_id, trip_date, status, started_at)
  values (p_route_id, p_trip_date, 'in_progress', now())
  on conflict (route_id, trip_date) do update
    set status = case when public.trips.status = 'scheduled'
                       then 'in_progress' else public.trips.status end,
        started_at = coalesce(public.trips.started_at, now())
  returning * into v_trip;

  if v_trip.status <> 'in_progress' then
    raise exception 'trip_already_%', v_trip.status using errcode = '55000';
  end if;

  insert into public.trip_events (trip_id, student_id, kind)
  select v_trip.id, null, 'started'
  where not exists (
    select 1 from public.trip_events e
    where e.trip_id = v_trip.id and e.kind = 'started'
  );

  select kind into v_kind from public.routes where id = v_trip.route_id;

  return jsonb_build_object(
    'tripId', v_trip.id,
    'routeId', v_trip.route_id,
    'kind', v_kind,
    'direction', public.route_direction(v_kind),
    'status', v_trip.status
  );
end;
$$;

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
  v_existing public.trip_events%rowtype;
  v_event public.trip_events%rowtype;
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

  -- Idempotencia móvil: si el conductor toca dos veces o la red reintenta,
  -- no se duplica la parada. Devolvemos el evento terminal ya existente.
  select * into v_existing
  from public.trip_events
  where trip_id = p_trip_id
    and student_id = p_student_id
    and kind in ('picked_up', 'dropped_off', 'skipped')
  order by created_at asc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'studentId', p_student_id,
      'event', v_existing.kind,
      'direction', public.route_direction(v_kind),
      'createdAt', v_existing.created_at,
      'idempotent', true
    );
  end if;

  insert into public.trip_events (trip_id, student_id, kind)
  values (p_trip_id, p_student_id, v_event_kind)
  returning * into v_event;

  delete from public.trip_stop_eta
  where trip_id = p_trip_id
    and student_id = p_student_id;

  return jsonb_build_object(
    'studentId', p_student_id,
    'event', v_event.kind,
    'direction', public.route_direction(v_kind),
    'createdAt', v_event.created_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.driver_finish_trip(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_kind public.route_kind;
  v_total int;
  v_completed int;
  v_absent int;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  if not public.is_my_trip(p_trip_id) then
    raise exception 'not_your_trip' using errcode = '42501';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'trip_not_found' using errcode = '02000';
  end if;

  if v_trip.status = 'in_progress' then
    update public.trips
      set status = 'finished', ended_at = now()
      where id = p_trip_id
      returning * into v_trip;

    insert into public.trip_events (trip_id, student_id, kind)
    select p_trip_id, null, 'finished'
    where not exists (
      select 1 from public.trip_events
      where trip_id = p_trip_id and kind = 'finished'
    );

    delete from public.trip_stop_eta where trip_id = p_trip_id;
  elsif v_trip.status <> 'finished' then
    raise exception 'trip_not_in_progress' using errcode = '55000';
  end if;

  select kind into v_kind from public.routes where id = v_trip.route_id;

  select count(*) into v_total
  from public.route_stops
  where route_id = v_trip.route_id;

  select count(distinct student_id) into v_absent
  from public.trip_events
  where trip_id = p_trip_id and kind = 'skipped';

  select count(distinct student_id) into v_completed
  from public.trip_events
  where trip_id = p_trip_id
    and kind = case when v_kind = 'AM' then 'picked_up'::public.trip_event_kind
                    else 'dropped_off'::public.trip_event_kind end;

  return jsonb_build_object(
    'tripId', v_trip.id,
    'routeId', v_trip.route_id,
    'kind', v_kind,
    'direction', public.route_direction(v_kind),
    'total', v_total,
    'completed', v_completed,
    'absent', v_absent,
    'startedAt', v_trip.started_at,
    'endedAt', v_trip.ended_at
  );
end;
$$;

grant execute on function public.route_direction(public.route_kind) to authenticated, anon;
grant execute on function public.driver_start_trip(uuid, date) to authenticated;
grant execute on function public.driver_mark_stop(uuid, uuid, text) to authenticated;
grant execute on function public.driver_finish_trip(uuid) to authenticated;

