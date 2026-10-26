-- ============================================================================
-- 0001_schema.sql
-- Esquema base: personas, vehículos, rutas, alumnos, recorridos y eventos.
--
-- Convenciones:
--   - Toda tabla usa uuid como PK (default gen_random_uuid()).
--   - "carrier" = transportista (dueño/operador de uno o más vehículos).
--   - "guardian" = apoderado.
--   - Una "route" es la PLANTILLA (qué alumnos, en qué orden, AM o PM).
--   - Un "trip" es la INSTANCIA de un día concreto de esa plantilla.
--   - La posición GPS del conductor NUNCA se persiste: sólo pasa por
--     Supabase Realtime Broadcast (canal trip:{id}) camino a la Edge
--     Function que calcula el ETA. Ver 0004_functions.sql y
--     supabase/functions/update-eta.
-- ============================================================================

-- gen_random_uuid() es nativo desde PostgreSQL 13 (antes vivía en
-- pgcrypto); no se necesita ninguna extensión para los defaults de abajo.

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------

-- Un transportista: dueño/operador de un furgón. 1:1 con auth.users mientras
-- el MVP no soporte acompañantes con su propia cuenta (ver nota en README).
create table public.carriers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  created_at  timestamptz not null default now()
);

-- Un apoderado. Puede llegar por login normal (SMS/OTP) o por invitación
-- (sesión anónima ligada a un token, ver 0003_invites.sql).
create table public.guardians (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vehículos, alumnos y relación alumno-apoderado
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  carrier_id  uuid not null references public.carriers(id) on delete cascade,
  nickname    text not null,            -- "Furgón 1"
  plate       text,                     -- patente, opcional en el piloto
  created_at  timestamptz not null default now()
);

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  carrier_id  uuid not null references public.carriers(id) on delete cascade,
  full_name   text not null,
  created_at  timestamptz not null default now()
);

create table public.student_guardians (
  student_id  uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  primary key (student_id, guardian_id)
);

-- ---------------------------------------------------------------------------
-- Rutas (plantilla) y paradas
-- ---------------------------------------------------------------------------

create type public.route_kind as enum ('AM', 'PM');

create table public.routes (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
  kind           public.route_kind not null,
  name           text not null,               -- "Ruta de la mañana"
  departure_time time not null,                -- hora de salida habitual
  school_name    text not null,
  school_lat     double precision not null,
  school_lng     double precision not null,
  created_at     timestamptz not null default now()
);

-- Una parada por alumno y ruta (AM y PM pueden tener direcciones distintas:
-- ida al colegio vs. devuelta a una casa distinta, por ejemplo la del otro
-- padre). "seq" es el orden de recogida/dejada dentro de esa ruta.
create table public.route_stops (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  seq         int not null,
  address     text not null,
  lat         double precision not null,
  lng         double precision not null,
  unique (route_id, student_id),
  unique (route_id, seq)
);

-- ---------------------------------------------------------------------------
-- Recorridos (instancia diaria) y eventos
-- ---------------------------------------------------------------------------

create type public.trip_status as enum ('scheduled', 'in_progress', 'finished', 'canceled');

create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.routes(id) on delete cascade,
  trip_date    date not null,
  status       public.trip_status not null default 'scheduled',
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz not null default now(),
  unique (route_id, trip_date)
);

create type public.trip_event_kind as enum (
  'started',       -- recorrido iniciado (student_id null)
  'approaching',   -- furgón cerca de la parada de student_id
  'picked_up',     -- alumno subió
  'skipped',       -- alumno no viaja hoy (marcado por el conductor en vivo)
  'dropped_off',   -- alumno llegó a destino (colegio o casa, según route_kind)
  'finished'       -- recorrido finalizado (student_id null)
);

create table public.trip_events (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  student_id  uuid references public.students(id) on delete cascade,
  kind        public.trip_event_kind not null,
  created_at  timestamptz not null default now()
);

-- Ausencia avisada POR EL APODERADO con antelación ("hoy no viaja"),
-- distinta del evento 'skipped' que registra el conductor en vivo.
create table public.absences (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  absence_date date not null,
  route_kind   public.route_kind not null,
  created_by   uuid not null references public.guardians(id),
  created_at   timestamptz not null default now(),
  unique (student_id, absence_date, route_kind)
);

-- ---------------------------------------------------------------------------
-- ETA en vivo. Para privacidad, cada apoderado lee sólo el ETA de su hijo.
-- La ubicación GPS exacta no vive aquí; el MVP+ tipo Uber agrega
-- trip_vehicle_location en 0008, con sólo la última coordenada del recorrido
-- activo, sin historial y protegida por RLS.
-- ---------------------------------------------------------------------------

create table public.trip_stop_eta (
  trip_id      uuid not null references public.trips(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  eta_seconds  int not null,
  updated_at   timestamptz not null default now(),
  primary key (trip_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Índices de soporte a las políticas RLS y a las consultas del día a día
-- ---------------------------------------------------------------------------

create index idx_vehicles_carrier on public.vehicles (carrier_id);
create index idx_students_carrier on public.students (carrier_id);
create index idx_student_guardians_guardian on public.student_guardians (guardian_id);
create index idx_routes_vehicle on public.routes (vehicle_id);
create index idx_route_stops_route on public.route_stops (route_id);
create index idx_route_stops_student on public.route_stops (student_id);
create index idx_trips_route_date on public.trips (route_id, trip_date);
create index idx_trip_events_trip on public.trip_events (trip_id);
create index idx_trip_events_student on public.trip_events (student_id);
create index idx_absences_student_date on public.absences (student_id, absence_date);
