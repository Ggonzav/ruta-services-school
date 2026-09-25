-- ============================================================================
-- 0004_functions.sql
-- RPCs del flujo diario del conductor. Se ejecutan con la sesión normal del
-- transportista (no SECURITY DEFINER): las políticas de 0002_rls.sql ya le
-- dan acceso total a sus propias rutas/recorridos, así que estas funciones
-- sólo empaquetan varios pasos en una transacción y agregan validaciones de
-- estado (no iniciar dos veces, no marcar eventos de un recorrido ajeno).
-- ============================================================================

-- Inicia (o retoma) el recorrido de hoy para una ruta. Idempotente: si ya
-- existe un trip 'scheduled' para esa fecha lo pasa a 'in_progress'; si ya
-- estaba 'in_progress' sólo lo devuelve (permite reabrir la app sin duplicar
-- el evento "iniciado").
create function public.start_trip(p_route_id uuid, p_trip_date date default current_date)
returns public.trips
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
begin
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

  -- Un solo evento "started" por trip, aunque la app llame start_trip de
  -- nuevo (p.ej. tras perder conexión).
  insert into public.trip_events (trip_id, student_id, kind)
  select v_trip.id, null, 'started'
  where not exists (
    select 1 from public.trip_events e
    where e.trip_id = v_trip.id and e.kind = 'started'
  );

  return v_trip;
end;
$$;

-- Registra un evento por alumno: picked_up, skipped, dropped_off o
-- approaching. Sólo válido mientras el recorrido está en curso.
create function public.record_student_event(
  p_trip_id uuid,
  p_student_id uuid,
  p_kind public.trip_event_kind
)
returns public.trip_events
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.trip_status;
  v_event public.trip_events%rowtype;
begin
  if p_kind not in ('picked_up', 'skipped', 'dropped_off', 'approaching') then
    raise exception 'invalid_student_event_kind' using errcode = '22023';
  end if;

  -- is_my_trip() es SECURITY DEFINER (ve más allá de RLS) y decide primero,
  -- igual que start_trip/finish_trip: así el mensaje de error no depende
  -- de si el trip existe (evita filtrar por timing/mensaje si el trip es
  -- de otro transportista).
  if not public.is_my_trip(p_trip_id) then
    raise exception 'not_your_trip' using errcode = '42501';
  end if;

  select status into v_status from public.trips where id = p_trip_id;

  if v_status <> 'in_progress' then
    raise exception 'trip_not_in_progress' using errcode = '55000';
  end if;

  insert into public.trip_events (trip_id, student_id, kind)
  values (p_trip_id, p_student_id, p_kind)
  returning * into v_event;

  return v_event;
end;
$$;

-- Cierra el recorrido: no admite más eventos de alumnos después.
create function public.finish_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
begin
  if not public.is_my_trip(p_trip_id) then
    raise exception 'not_your_trip' using errcode = '42501';
  end if;

  update public.trips
    set status = 'finished', ended_at = now()
    where id = p_trip_id and status = 'in_progress'
    returning * into v_trip;

  if v_trip.id is null then
    raise exception 'trip_not_in_progress' using errcode = '55000';
  end if;

  insert into public.trip_events (trip_id, student_id, kind)
  values (p_trip_id, null, 'finished');

  -- Un recorrido finalizado deja de exponer ETA: no tiene sentido mostrar
  -- "llega en 6 min" de un furgón que ya no comparte ubicación.
  delete from public.trip_stop_eta where trip_id = p_trip_id;

  return v_trip;
end;
$$;

-- Aviso "hoy no viaja" hecho por el apoderado con antelación. Usa la RLS
-- normal de absences (0002_rls.sql); esta función sólo valida la fecha y
-- deja un solo registro por alumno/fecha/turno (upsert).
create function public.mark_absence(
  p_student_id uuid,
  p_absence_date date,
  p_route_kind public.route_kind
)
returns public.absences
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_absence public.absences%rowtype;
begin
  if not public.is_guardian_of_student(p_student_id) then
    raise exception 'not_your_student' using errcode = '42501';
  end if;

  insert into public.absences (student_id, absence_date, route_kind, created_by)
  values (p_student_id, p_absence_date, p_route_kind, public.current_guardian_id())
  on conflict (student_id, absence_date, route_kind) do nothing
  returning * into v_absence;

  if v_absence.id is null then
    select * into v_absence from public.absences
    where student_id = p_student_id
      and absence_date = p_absence_date
      and route_kind = p_route_kind;
  end if;

  return v_absence;
end;
$$;

grant execute on function public.start_trip(uuid, date) to authenticated;
grant execute on function public.record_student_event(uuid, uuid, public.trip_event_kind) to authenticated;
grant execute on function public.finish_trip(uuid) to authenticated;
grant execute on function public.mark_absence(uuid, date, public.route_kind) to authenticated;
