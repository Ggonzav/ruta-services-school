-- Contacto administrativo: no crea cuentas ni concede acceso a apoderados.
create table public.student_profiles (
  student_id uuid primary key references public.students(id) on delete cascade,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  guardian_name text not null,
  guardian_phone text not null
);
alter table public.student_profiles enable row level security;
create policy carrier_profile on public.student_profiles for all to authenticated
using (public.is_my_student(student_id)) with check (public.is_my_student(student_id));
revoke all on public.student_profiles from public, anon, authenticated;
grant select, insert, update on public.student_profiles to authenticated;

-- Guarda alumno, contacto y ambos trayectos en una sola transacción.
create function public.carrier_save_student_profile(
 p_student_id uuid, p_full_name text, p_address text, p_lat double precision, p_lng double precision,
 p_guardian_name text, p_guardian_phone text, p_am_route uuid, p_pm_route uuid
) returns uuid language plpgsql security invoker set search_path=public as $$
declare sid uuid; rid uuid;
begin
 if public.current_carrier_id() is null then raise exception 'not_a_carrier' using errcode='42501'; end if;
 if coalesce(btrim(p_full_name),'')='' or coalesce(btrim(p_address),'')='' or
 coalesce(btrim(p_guardian_name),'')='' or coalesce(btrim(p_guardian_phone),'')='' then
 raise exception 'profile_fields_required'; end if;
 if p_lat is null or p_lng is null or not (p_lat between -90 and 90 and p_lng between -180 and 180) then
 raise exception 'invalid_coordinates'; end if;
 if p_am_route is not null and not exists(select 1 from routes where id=p_am_route and kind='AM' and public.is_my_route(id)) then
 raise exception 'not_your_route' using errcode='42501'; end if;
 if p_pm_route is not null and not exists(select 1 from routes where id=p_pm_route and kind='PM' and public.is_my_route(id)) then
 raise exception 'not_your_route' using errcode='42501'; end if;
 sid:=p_student_id;
 if sid is null then sid:=public.carrier_create_student(p_full_name);
 else
   if not public.is_my_student(sid) then raise exception 'not_your_student' using errcode='42501'; end if;
   perform public.carrier_rename_student(sid,p_full_name);
 end if;
 -- Orden estable para evitar bloqueos cruzados al editar ambos trayectos.
 perform 1 from routes where id in (select route_id from route_stops where student_id=sid)
 or id in (p_am_route,p_pm_route) order by id for update;
 delete from route_stops where student_id=sid
 and route_id is distinct from p_am_route and route_id is distinct from p_pm_route;
 foreach rid in array array[p_am_route,p_pm_route] loop
   if rid is not null then perform public.carrier_assign_student_to_route(sid,rid,p_address,p_lat,p_lng); end if;
 end loop;
 insert into student_profiles values(sid,btrim(p_address),p_lat,p_lng,btrim(p_guardian_name),btrim(p_guardian_phone))
 on conflict(student_id) do update set address=excluded.address,lat=excluded.lat,lng=excluded.lng,
 guardian_name=excluded.guardian_name,guardian_phone=excluded.guardian_phone;
 return sid;
end $$;
revoke all on function public.carrier_save_student_profile(uuid,text,text,double precision,double precision,text,text,uuid,uuid) from public,anon;
grant execute on function public.carrier_save_student_profile(uuid,text,text,double precision,double precision,text,text,uuid,uuid) to authenticated;
