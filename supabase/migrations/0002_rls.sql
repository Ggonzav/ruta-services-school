-- ============================================================================
-- 0002_rls.sql
-- Row Level Security: la privacidad se aplica aquí, no en la app.
--
-- Regla de oro del producto: un apoderado nunca puede leer una fila que
-- pertenezca a otro alumno, ni siquiera del mismo furgón/recorrido. Cada
-- política de "guardian" abajo está escrita para que eso sea verdad incluso
-- si el cliente (app o web) tiene un bug o alguien inspecciona la red.
--
-- Funciones auxiliares SECURITY DEFINER: evitan que una política sobre la
-- tabla A tenga que evaluar RLS de la tabla B (lo que en Postgres puede
-- volverse recursivo/lento). Cada una hace UNA pregunta acotada.
-- ============================================================================

alter table public.carriers          enable row level security;
alter table public.guardians         enable row level security;
alter table public.vehicles          enable row level security;
alter table public.students          enable row level security;
alter table public.student_guardians enable row level security;
alter table public.routes            enable row level security;
alter table public.route_stops       enable row level security;
alter table public.trips             enable row level security;
alter table public.trip_events       enable row level security;
alter table public.trip_stop_eta     enable row level security;
alter table public.absences          enable row level security;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------

create function public.current_carrier_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.carriers where user_id = auth.uid();
$$;

create function public.current_guardian_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.guardians where user_id = auth.uid();
$$;

-- ¿El alumno pertenece a un transportista que soy yo?
create function public.is_my_student(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.carrier_id = public.current_carrier_id()
  );
$$;

-- ¿Soy apoderado de este alumno? (única puerta de entrada a los datos de
-- un alumno para cualquier rol "guardian")
create function public.is_guardian_of_student(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.student_guardians sg
    where sg.student_id = p_student_id
      and sg.guardian_id = public.current_guardian_id()
  );
$$;

-- ¿El vehículo es mío (transportista)? Se usa para las políticas de
-- "routes": el check de INSERT en una tabla no puede reconsultar una fila
-- de esa MISMA tabla que todavía se está insertando (no es visible aún
-- dentro del propio comando), así que "routes" valida por vehicle_id
-- directo en vez de reusar is_my_route(id).
create function public.is_my_vehicle(p_vehicle_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.carrier_id = public.current_carrier_id()
  );
$$;

-- ¿La ruta es mía (transportista)? Válida para políticas de OTRAS tablas
-- que referencian routes (route_stops, trips, ...), donde la fila de
-- routes ya existe y está comprometida. No usar en la política de
-- "routes" misma (ver is_my_vehicle arriba).
create function public.is_my_route(p_route_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.routes r
    join public.vehicles v on v.id = r.vehicle_id
    where r.id = p_route_id
      and v.carrier_id = public.current_carrier_id()
  );
$$;

-- ¿Tengo (como apoderado) al menos un hijo con parada en esta ruta?
-- Se usa SOLO para decidir si veo metadatos generales de la ruta
-- (nombre, colegio, hora) — nunca para listar las paradas de otros.
create function public.guardian_has_stop_in_route(p_route_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.route_stops rs
    where rs.route_id = p_route_id
      and public.is_guardian_of_student(rs.student_id)
  );
$$;

-- ¿El recorrido es mío (transportista)?
create function public.is_my_trip(p_trip_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and public.is_my_route(t.route_id)
  );
$$;

-- ¿Tengo (como apoderado) un hijo en este recorrido?
create function public.guardian_has_stop_in_trip(p_trip_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and public.guardian_has_stop_in_route(t.route_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- carriers / guardians: cada quien sólo ve y edita su propia fila.
-- ---------------------------------------------------------------------------

create policy carriers_self_select on public.carriers
  for select using (user_id = auth.uid());

create policy carriers_self_insert on public.carriers
  for insert with check (user_id = auth.uid());

create policy carriers_self_update on public.carriers
  for update using (user_id = auth.uid());

create policy guardians_self_select on public.guardians
  for select using (user_id = auth.uid());

create policy guardians_self_insert on public.guardians
  for insert with check (user_id = auth.uid());

create policy guardians_self_update on public.guardians
  for update using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- vehicles: sólo el transportista dueño.
-- ---------------------------------------------------------------------------

create policy vehicles_carrier_all on public.vehicles
  for all
  using (carrier_id = public.current_carrier_id())
  with check (carrier_id = public.current_carrier_id());

-- ---------------------------------------------------------------------------
-- students: el transportista, dueño total. El apoderado, sólo lectura de
-- SUS alumnos (nunca una lista de "todos los alumnos del furgón").
-- ---------------------------------------------------------------------------

create policy students_carrier_all on public.students
  for all
  using (carrier_id = public.current_carrier_id())
  with check (carrier_id = public.current_carrier_id());

create policy students_guardian_select on public.students
  for select
  using (public.is_guardian_of_student(id));

-- ---------------------------------------------------------------------------
-- student_guardians: el transportista administra el vínculo (de sus
-- alumnos); el apoderado sólo ve sus propios vínculos.
-- ---------------------------------------------------------------------------

create policy student_guardians_carrier_all on public.student_guardians
  for all
  using (public.is_my_student(student_id))
  with check (public.is_my_student(student_id));

create policy student_guardians_guardian_select on public.student_guardians
  for select
  using (guardian_id = public.current_guardian_id());

-- ---------------------------------------------------------------------------
-- routes: el transportista, dueño total. El apoderado sólo ve la ruta si
-- tiene un hijo con parada en ella (para nombre/colegio/hora), nunca la
-- lista completa de rutas del transportista.
-- ---------------------------------------------------------------------------

create policy routes_carrier_all on public.routes
  for all
  using (public.is_my_vehicle(vehicle_id))
  with check (public.is_my_vehicle(vehicle_id));

create policy routes_guardian_select on public.routes
  for select
  using (public.guardian_has_stop_in_route(id));

-- ---------------------------------------------------------------------------
-- route_stops: EL PUNTO MÁS SENSIBLE DEL ESQUEMA.
-- El transportista ve todas las paradas de sus rutas (las necesita para
-- ordenar el recorrido). El apoderado ve EXCLUSIVAMENTE la fila de su
-- propio hijo — jamás las direcciones de otras familias de la misma ruta.
-- ---------------------------------------------------------------------------

create policy route_stops_carrier_all on public.route_stops
  for all
  using (public.is_my_route(route_id))
  with check (public.is_my_route(route_id));

create policy route_stops_guardian_select on public.route_stops
  for select
  using (public.is_guardian_of_student(student_id));

-- ---------------------------------------------------------------------------
-- trips: el transportista, dueño total. El apoderado ve el recorrido si
-- tiene un hijo en la ruta asociada.
-- ---------------------------------------------------------------------------

create policy trips_carrier_all on public.trips
  for all
  using (public.is_my_route(route_id))
  with check (public.is_my_route(route_id));

create policy trips_guardian_select on public.trips
  for select
  using (public.guardian_has_stop_in_route(route_id));

-- ---------------------------------------------------------------------------
-- trip_events: el transportista crea y lee todos los eventos de sus
-- recorridos. El apoderado sólo lee: (a) eventos generales del recorrido
-- (student_id nulo: "iniciado"/"finalizado") y (b) eventos de SU hijo.
-- Nunca los "subió"/"llegó"/"no viaja" de otro alumno.
-- ---------------------------------------------------------------------------

create policy trip_events_carrier_all on public.trip_events
  for all
  using (public.is_my_trip(trip_id))
  with check (public.is_my_trip(trip_id));

create policy trip_events_guardian_select on public.trip_events
  for select
  using (
    (student_id is null and public.guardian_has_stop_in_trip(trip_id))
    or (student_id is not null and public.is_guardian_of_student(student_id))
  );

-- ---------------------------------------------------------------------------
-- trip_stop_eta: nunca hay coordenadas aquí, sólo segundos restantes. Aun
-- así, cada apoderado ve sólo la fila de su hijo. La Edge Function escribe
-- con la service role key, que ignora RLS, así que no hace falta una
-- política de insert/update para roles de cliente.
-- ---------------------------------------------------------------------------

create policy trip_stop_eta_guardian_select on public.trip_stop_eta
  for select
  using (public.is_guardian_of_student(student_id));

create policy trip_stop_eta_carrier_select on public.trip_stop_eta
  for select
  using (public.is_my_student(student_id));

-- ---------------------------------------------------------------------------
-- absences: el apoderado administra las ausencias de sus propios hijos.
-- El transportista sólo lee (para saber a quién no pasar a buscar).
-- ---------------------------------------------------------------------------

create policy absences_guardian_all on public.absences
  for all
  using (
    public.is_guardian_of_student(student_id)
    and created_by = public.current_guardian_id()
  )
  with check (
    public.is_guardian_of_student(student_id)
    and created_by = public.current_guardian_id()
  );

create policy absences_carrier_select on public.absences
  for select
  using (public.is_my_student(student_id));
