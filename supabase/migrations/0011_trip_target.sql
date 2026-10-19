-- Private destination state: trips is visible to guardians, this table is not.
create table public.trip_targets (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  revision bigint not null default 0
);
alter table public.trip_targets enable row level security;
revoke all on public.trip_targets from public, anon, authenticated;

create function public.driver_get_target(p_trip_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_my_trip(p_trip_id) then
    raise exception 'not_your_trip' using errcode='42501';
  end if;
  return coalesce((select jsonb_build_object('studentId', student_id, 'revision', revision)
    from public.trip_targets where trip_id=p_trip_id), jsonb_build_object('studentId',null,'revision',0));
end; $$;

create function public.driver_set_target(p_trip_id uuid, p_student_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_trip public.trips%rowtype;
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode='28000'; end if;
  if not public.is_my_trip(p_trip_id) then raise exception 'not_your_trip' using errcode='42501'; end if;
  select * into v_trip from public.trips where id=p_trip_id for update;
  if v_trip.status <> 'in_progress' then raise exception 'trip_not_in_progress' using errcode='55000'; end if;
  if p_student_id is not null then
    if not exists(select 1 from public.route_stops where route_id=v_trip.route_id and student_id=p_student_id) then
      raise exception 'student_not_in_trip_route' using errcode='42501';
    end if;
    if exists(select 1 from public.trip_events where trip_id=p_trip_id and student_id=p_student_id and kind in ('picked_up','dropped_off','skipped')) then
      raise exception 'student_already_settled' using errcode='55000';
    end if;
  end if;
  insert into public.trip_targets(trip_id,student_id,revision) values(p_trip_id,p_student_id,1)
    on conflict(trip_id) do update set student_id=excluded.student_id,revision=trip_targets.revision+1;
  delete from public.trip_stop_eta where trip_id=p_trip_id;
end; $$;

-- Lock BEFORE recording a terminal event, sharing the same serialization
-- boundary as selection and ETA persistence (including direct event inserts).
create function public.clear_target_on_settle() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.kind in ('picked_up','dropped_off','skipped') then
    perform 1 from public.trips where id=new.trip_id for update;
    update public.trip_targets set student_id=null,revision=revision+1
      where trip_id=new.trip_id and student_id=new.student_id;
    delete from public.trip_stop_eta where trip_id=new.trip_id and student_id=new.student_id;
  end if;
  return new;
end; $$;
create trigger trg_clear_target_on_settle before insert on public.trip_events
for each row execute function public.clear_target_on_settle();

create function public.guardian_is_next(p_trip_id uuid,p_student_id uuid) returns boolean
language sql security definer stable set search_path=public as $$
  select public.is_guardian_of_student(p_student_id) and exists(
    select 1 from public.trip_targets d join public.trips t on t.id=d.trip_id
    where t.id=p_trip_id and t.status='in_progress' and d.student_id=p_student_id);
$$;

-- The Edge Function may spend seconds awaiting Mapbox. Revalidate its snapshot
-- under the trip lock and atomically persist ETA + approaching, or discard it.
create function public.persist_target_eta(p_trip_id uuid,p_student_id uuid,p_revision bigint,
  p_eta_seconds integer,p_distance_meters integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_status public.trip_status;
begin
  select status into v_status from public.trips where id=p_trip_id for update;
  if v_status is distinct from 'in_progress' or not exists(
    select 1 from public.trip_targets where trip_id=p_trip_id and student_id=p_student_id and revision=p_revision
  ) or exists(select 1 from public.trip_events where trip_id=p_trip_id and student_id=p_student_id
    and kind in ('picked_up','dropped_off','skipped')) then return false; end if;
  if p_eta_seconds is null or p_eta_seconds<0 or p_distance_meters is null or p_distance_meters<0 then
    raise exception 'invalid_eta' using errcode='22023';
  end if;
  delete from public.trip_stop_eta where trip_id=p_trip_id and student_id<>p_student_id;
  insert into public.trip_stop_eta(trip_id,student_id,eta_seconds,updated_at)
    values(p_trip_id,p_student_id,p_eta_seconds,now()) on conflict(trip_id,student_id)
    do update set eta_seconds=excluded.eta_seconds,updated_at=excluded.updated_at;
  if p_distance_meters<=500 then
    insert into public.trip_events(trip_id,student_id,kind) values(p_trip_id,p_student_id,'approaching')
      on conflict(trip_id,student_id) where kind='approaching' do nothing;
  end if;
  return true;
end; $$;

revoke all on function public.driver_get_target(uuid) from public,anon;
revoke all on function public.driver_set_target(uuid,uuid) from public,anon;
revoke all on function public.guardian_is_next(uuid,uuid) from public,anon;
revoke all on function public.clear_target_on_settle() from public,anon,authenticated;
revoke all on function public.persist_target_eta(uuid,uuid,bigint,integer,integer) from public,anon,authenticated;
grant execute on function public.driver_get_target(uuid) to authenticated;
grant execute on function public.driver_set_target(uuid,uuid) to authenticated;
grant execute on function public.guardian_is_next(uuid,uuid) to authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.persist_target_eta(uuid,uuid,bigint,integer,integer) to service_role;
  end if;
end; $$;
