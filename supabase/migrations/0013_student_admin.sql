-- ============================================================================
-- 0013_student_admin.sql
-- "Mis alumnos": el transportista administra sus propios alumnos y las paradas
-- de sus rutas. La RLS de 0002 ya lo hace dueño de students/route_stops; aquí
-- agregamos:
--   1) Un bloqueo DURO (triggers) que impide cambiar alumnos o paradas de una
--      ruta MIENTRAS esa ruta tiene un recorrido en curso. Va como trigger,
--      no solo como validación de RPC, para que tampoco se pueda saltar
--      escribiendo directo a la tabla con la sesión del transportista.
--   2) RPCs que empaquetan alta, renombrado, asignación a ruta (con cálculo
--      seguro del "seq" siguiente) y baja de una parada. Son SECURITY INVOKER:
--      la RLS garantiza que el transportista solo toca lo suyo; estas funciones
--      agregan validación de pertenencia con mensajes claros y una transacción.
-- Invitar al apoderado reutiliza el flujo de invites (0003), sin cambios.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Bloqueo durante recorrido en curso
-- ---------------------------------------------------------------------------

-- route_stops: no se pueden crear, mover ni borrar paradas de una ruta con un
-- trip 'in_progress' (ni de la ruta destino ni de la de origen al reasignar).
create function public.block_route_stops_during_active_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.trips
    where status = 'in_progress'
      and route_id in (new.route_id, old.route_id)
  ) then
    raise exception 'route_has_active_trip' using errcode = '55000';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_block_route_stops_active
  before insert or update or delete on public.route_stops
  for each row execute function public.block_route_stops_during_active_trip();

-- students: no se puede renombrar ni borrar un alumno que participa en una
-- ruta con recorrido en curso. El alta (INSERT) nunca se bloquea: un alumno
-- recién creado todavía no está en ninguna ruta.
create function public.block_students_during_active_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.route_stops rs
    join public.trips t on t.route_id = rs.route_id and t.status = 'in_progress'
    where rs.student_id = coalesce(new.id, old.id)
  ) then
    raise exception 'student_has_active_trip' using errcode = '55000';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_block_students_active
  before update or delete on public.students
  for each row execute function public.block_students_during_active_trip();

-- ---------------------------------------------------------------------------
-- RPCs de administración (SECURITY INVOKER: se apoyan en la RLS de 0002)
-- ---------------------------------------------------------------------------

-- Alta de un alumno del transportista logueado. Devuelve el id nuevo.
create function public.carrier_create_student(p_full_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_carrier uuid;
  v_id uuid;
begin
  v_carrier := public.current_carrier_id();
  if v_carrier is null then
    raise exception 'not_a_carrier' using errcode = '42501';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  insert into public.students (carrier_id, full_name)
  values (v_carrier, btrim(p_full_name))
  returning id into v_id;

  return v_id;
end;
$$;

-- Renombrar un alumno propio.
create function public.carrier_rename_student(p_student_id uuid, p_full_name text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_my_student(p_student_id) then
    raise exception 'not_your_student' using errcode = '42501';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  update public.students
    set full_name = btrim(p_full_name)
    where id = p_student_id;
end;
$$;

-- Asigna (o actualiza) la parada de un alumno en una ruta del transportista.
-- Si la parada ya existe, actualiza dirección y coordenadas conservando el
-- orden (seq). Si es nueva, le asigna el siguiente seq serializando por ruta
-- para no chocar con unique(route_id, seq). Devuelve el id de la parada.
create function public.carrier_assign_student_to_route(
  p_student_id uuid,
  p_route_id uuid,
  p_address text,
  p_lat double precision,
  p_lng double precision
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_seq int;
begin
  if not public.is_my_student(p_student_id) then
    raise exception 'not_your_student' using errcode = '42501';
  end if;
  if not public.is_my_route(p_route_id) then
    raise exception 'not_your_route' using errcode = '42501';
  end if;
  if coalesce(btrim(p_address), '') = '' then
    raise exception 'address_required' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid_coordinates' using errcode = '22023';
  end if;

  select id into v_id
  from public.route_stops
  where route_id = p_route_id and student_id = p_student_id;

  if v_id is not null then
    update public.route_stops
      set address = btrim(p_address), lat = p_lat, lng = p_lng
      where id = v_id;
    return v_id;
  end if;

  -- Serializa las altas simultáneas en la misma ruta (bloqueo de la fila
  -- de routes) antes de calcular el seq siguiente.
  perform 1 from public.routes where id = p_route_id for update;
  select coalesce(max(seq), 0) + 1 into v_seq
    from public.route_stops where route_id = p_route_id;

  insert into public.route_stops (route_id, student_id, seq, address, lat, lng)
  values (p_route_id, p_student_id, v_seq, btrim(p_address), p_lat, p_lng)
  returning id into v_id;

  return v_id;
end;
$$;

-- Quita a un alumno de una ruta (borra su parada). No borra al alumno.
create function public.carrier_remove_student_from_route(p_student_id uuid, p_route_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_my_route(p_route_id) then
    raise exception 'not_your_route' using errcode = '42501';
  end if;

  delete from public.route_stops
    where route_id = p_route_id and student_id = p_student_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: solo usuarios autenticados; nunca anon. Los triggers corren con el
-- dueño de las tablas y no dependen de estos grants.
-- ---------------------------------------------------------------------------

revoke all on function public.block_route_stops_during_active_trip() from public, anon, authenticated;
revoke all on function public.block_students_during_active_trip() from public, anon, authenticated;

revoke all on function public.carrier_create_student(text) from public, anon;
revoke all on function public.carrier_rename_student(uuid, text) from public, anon;
revoke all on function public.carrier_assign_student_to_route(uuid, uuid, text, double precision, double precision) from public, anon;
revoke all on function public.carrier_remove_student_from_route(uuid, uuid) from public, anon;

grant execute on function public.carrier_create_student(text) to authenticated;
grant execute on function public.carrier_rename_student(uuid, text) to authenticated;
grant execute on function public.carrier_assign_student_to_route(uuid, uuid, text, double precision, double precision) to authenticated;
grant execute on function public.carrier_remove_student_from_route(uuid, uuid) to authenticated;
