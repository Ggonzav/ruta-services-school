-- ============================================================================
-- 0010_single_active_trip.sql
-- Un solo recorrido activo por furgón.
--
-- El link del apoderado es por alumno, no por turno: la web infiere qué
-- recorrido mostrar y prefiere el que está in_progress. Si queda una ida AM
-- sin finalizar cuando arranca la vuelta PM del mismo furgón, el apoderado
-- podía ver un turno ambiguo. Acá hacemos que iniciar un recorrido cancele
-- cualquier OTRO recorrido in_progress del mismo vehículo, y limpie su ETA y
-- ubicación. Solo se toca driver_start_trip (lo que usa la app); start_trip
-- (0004) quedó legacy y solo lo usan los tests.
-- ============================================================================

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
  v_vehicle_id uuid;
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

  -- Un solo recorrido activo por furgón: cancela cualquier otro in_progress
  -- del mismo vehículo (p. ej. una ida AM que quedó sin finalizar).
  select vehicle_id into v_vehicle_id from public.routes where id = v_trip.route_id;

  update public.trips t
     set status = 'canceled', ended_at = now()
    from public.routes r
   where t.route_id = r.id
     and r.vehicle_id = v_vehicle_id
     and t.id <> v_trip.id
     and t.status = 'in_progress';

  -- Un recorrido cancelado no debe dejar ETA ni ubicación en vivo.
  delete from public.trip_stop_eta e
   using public.trips t, public.routes r
   where e.trip_id = t.id and t.route_id = r.id
     and r.vehicle_id = v_vehicle_id and t.status = 'canceled';

  delete from public.trip_vehicle_location l
   using public.trips t, public.routes r
   where l.trip_id = t.id and t.route_id = r.id
     and r.vehicle_id = v_vehicle_id and t.status = 'canceled';

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

-- CREATE OR REPLACE conserva los permisos, pero los re-aplicamos para que esta
-- migración sea autosuficiente (mismo patrón que 0009).
revoke all on function public.driver_start_trip(uuid, date) from public;
grant execute on function public.driver_start_trip(uuid, date) to authenticated;
