-- ============================================================================
-- 0008_vehicle_location.sql
-- MVP+ "tipo Uber": última ubicación del furgón mientras el recorrido está
-- activo. No guarda historial; se sobreescribe por trip y se borra al
-- finalizar el recorrido.
-- ============================================================================

create table public.trip_vehicle_location (
  trip_id    uuid primary key references public.trips(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  heading    double precision,
  speed      double precision,
  updated_at timestamptz not null default now()
);

alter table public.trip_vehicle_location enable row level security;

create policy trip_vehicle_location_carrier_select on public.trip_vehicle_location
  for select
  using (public.is_my_trip(trip_id));

create policy trip_vehicle_location_guardian_select on public.trip_vehicle_location
  for select
  using (public.guardian_has_stop_in_trip(trip_id));

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
    delete from public.trip_vehicle_location where trip_id = p_trip_id;
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

