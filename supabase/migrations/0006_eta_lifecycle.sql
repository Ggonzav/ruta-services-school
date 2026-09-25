-- finish_trip runs with the driver's privileges, including RLS.
create policy trip_stop_eta_carrier_delete on public.trip_stop_eta
  for delete to authenticated
  using (public.is_my_trip(trip_id));

-- Serialize ETA writes with finish_trip so an in-flight Directions request
-- cannot recreate the ETA after the trip has ended.
create function public.check_eta_trip_active()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status public.trip_status;
begin
  select status into v_status from public.trips
    where id = new.trip_id for update;
  if v_status is distinct from 'in_progress' then
    return null;
  end if;
  return new;
end;
$$;

create trigger trip_stop_eta_active
  before insert or update on public.trip_stop_eta
  for each row execute function public.check_eta_trip_active();

-- Clean up ETAs left behind by the previous finish_trip implementation.
delete from public.trip_stop_eta e using public.trips t
  where e.trip_id = t.id and t.status in ('finished', 'canceled');
