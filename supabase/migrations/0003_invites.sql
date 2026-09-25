-- ============================================================================
-- 0003_invites.sql
-- Invitaciones: el link de WhatsApp que un apoderado abre sin instalar nada.
--
-- El "token" es el propio id (uuid) de la invitación — no adivinable, y no
-- hace falta una columna aparte. El flujo es:
--
--   1. El transportista crea una invitación para un alumno (RLS normal,
--      usando su sesión). Comparte /i/<id> por WhatsApp.
--   2. El apoderado abre el link. El cliente llama
--      supabase.auth.signInAnonymously() (sesión anónima de Supabase) y
--      luego RPC redeem_invite(token, nombre).
--   3. redeem_invite crea/actualiza la fila guardians de ese usuario anónimo,
--      la liga a ese alumno en student_guardians, y devuelve sólo los datos
--      necesarios para pintar la pantalla de ETA (nunca la ruta completa).
--
-- La tabla invites NO tiene política de lectura para "authenticated": todo
-- pasa por la función SECURITY DEFINER de abajo, así un apoderado nunca
-- puede listar o adivinar invitaciones de otras familias.
-- ============================================================================

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  carrier_id  uuid not null references public.carriers(id) on delete cascade,
  expires_at  timestamptz not null default (now() + interval '90 days'),
  created_at  timestamptz not null default now()
);

create index idx_invites_student on public.invites (student_id);

alter table public.invites enable row level security;

-- El transportista puede crear y listar (para reenviar) las invitaciones
-- de sus propios alumnos. No hay policy de select/insert para "guardian":
-- deliberado, así nadie autenticado como apoderado puede leer esta tabla.
create policy invites_carrier_all on public.invites
  for all
  using (public.is_my_student(student_id) and carrier_id = public.current_carrier_id())
  with check (public.is_my_student(student_id) and carrier_id = public.current_carrier_id());

-- ---------------------------------------------------------------------------
-- redeem_invite: el único punto de entrada para canjear un link.
-- SECURITY DEFINER: corre con los privilegios de quien la creó (no del
-- usuario anónimo que la llama), así puede leer invites/students/routes
-- sin que existan políticas RLS para "cualquier autenticado".
-- ---------------------------------------------------------------------------

create function public.redeem_invite(p_token uuid, p_full_name text)
returns table (
  guardian_id     uuid,
  student_id      uuid,
  student_name    text,
  route_name      text,
  school_name     text,
  departure_time  time,
  vehicle_nickname text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite    public.invites%rowtype;
  v_guardian_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into v_invite
  from public.invites i
  where i.id = p_token
    and i.expires_at > now();

  if not found then
    raise exception 'invite_not_found_or_expired' using errcode = 'P0002';
  end if;

  insert into public.guardians (user_id, full_name)
  values (auth.uid(), coalesce(nullif(trim(p_full_name), ''), 'Apoderado'))
  on conflict (user_id) do update
    set full_name = excluded.full_name
  returning id into v_guardian_id;

  insert into public.student_guardians (student_id, guardian_id)
  values (v_invite.student_id, v_guardian_id)
  on conflict do nothing;

  return query
  select
    v_guardian_id,
    s.id,
    s.full_name,
    r.name,
    r.school_name,
    r.departure_time,
    v.nickname
  from public.students s
  join public.route_stops rs on rs.student_id = s.id
  join public.routes r on r.id = rs.route_id
  join public.vehicles v on v.id = r.vehicle_id
  where s.id = v_invite.student_id
  order by r.departure_time
  limit 1;
end;
$$;

revoke all on function public.redeem_invite(uuid, text) from public;
grant execute on function public.redeem_invite(uuid, text) to anon, authenticated;
