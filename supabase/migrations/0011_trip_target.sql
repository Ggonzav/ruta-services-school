-- ============================================================================
-- 0011_trip_target.sql
-- El conductor elige la próxima parada (destino actual del furgón).
--
-- `trips.target_student_id` es el alumno hacia el que el furgón va AHORA. Lo
-- fija el conductor con driver_set_target. Se limpia solo cuando ese alumno
-- queda marcado (subió/bajó/no viaja), vía trigger.
--
-- El apoderado nunca lee ese id (sería el de otro niño): solo consulta un
-- booleano sobre SU propio hijo con guardian_is_next. Así la web muestra
-- "va hacia tu casa" (ruta + ETA) solo cuando su hijo es el destino, y
-- "atendiendo otras paradas" en cualquier otro caso.
-- ============================================================================

alter table public.trips
  add column target_student_id uuid references public.students(id) on delete set null;

-- El conductor declara (o limpia, con null) a quién va ahora.
create or replace function public.driver_set_target(
  p_trip_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
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
  if v_trip.status <> 'in_progress' then
    raise exception 'trip_not_in_progress' using errcode = '55000';
  end if;

  if p_student_id is not null and not exists (
    select 1 from public.route_stops rs
    where rs.route_id = v_trip.route_id and rs.student_id = p_student_id
  ) then
    raise exception 'student_not_in_trip_route' using errcode = '42501';
  end if;

  update public.trips set target_student_id = p_student_id where id = p_trip_id;
end;
$$;

-- Cuando el alumno-destino queda marcado (terminal), el destino se limpia
-- solo: el conductor volverá a elegir la siguiente parada.
create or replace function public.clear_target_on_settle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind in ('picked_up', 'dropped_off', 'skipped') and new.student_id is not null then
    update public.trips
       set target_student_id = null
     where id = new.trip_id
       and target_student_id = new.student_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_target_on_settle on public.trip_events;
create trigger trg_clear_target_on_settle
  after insert on public.trip_events
  for each row execute function public.clear_target_on_settle();

-- El apoderado solo sabe, sobre SU hijo, si es el destino actual. No ve a
-- quién va el furgón cuando no es su hijo.
create or replace function public.guardian_is_next(
  p_trip_id uuid,
  p_student_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_guardian_of_student(p_student_id)
     and exists (
       select 1 from public.trips t
       where t.id = p_trip_id
         and t.status = 'in_progress'
         and t.target_student_id = p_student_id
     );
$$;

revoke all on function public.driver_set_target(uuid, uuid) from public;
grant execute on function public.driver_set_target(uuid, uuid) to authenticated;

revoke all on function public.guardian_is_next(uuid, uuid) from public;
grant execute on function public.guardian_is_next(uuid, uuid) to authenticated;
