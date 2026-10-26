-- ============================================================================
-- 0016_single_use_invites.sql
-- Endurece el canje de invitaciones (privacidad del apoderado).
--
-- El link de invitación (`/i/<token>`) es un "bearer token": quien lo tiene
-- puede canjearlo. Para limitar reenvíos/filtraciones, cada invitación pasa a
-- ser de **un solo uso**: queda ligada al primer apoderado (usuario) que la
-- canjea. Un segundo usuario/dispositivo distinto NO puede canjear el mismo
-- link; el transportista reenvía una invitación nueva (botón "Compartir").
--
-- Además, la caducidad por defecto baja de 90 a **30 días**.
--
-- Decisiones (ver PROJECT_CONTEXT.md §8):
--   * El alumno lo determina SIEMPRE el token, nunca el nombre. NO se valida el
--     nombre contra `student_profiles.guardian_name` (eso bloqueaba apoderados
--     legítimos —acentos, segundo apellido, campo vacío— y no cerraba el vector
--     real, que es la posesión del link).
--   * Reabrir el MISMO link en el MISMO dispositivo (mismo `auth.uid()`) sigue
--     funcionando: el canje es idempotente para ese usuario.
--
-- `redeem_invite` mantiene su firma `(uuid, text)` y las columnas que devuelve.
-- ============================================================================

alter table public.invites
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_by uuid;

-- Caducidad por defecto: 30 días (antes 90). Solo afecta a invitaciones nuevas.
alter table public.invites
  alter column expires_at set default (now() + interval '30 days');

create or replace function public.redeem_invite(p_token uuid, p_full_name text)
returns table (
  guardian_id      uuid,
  student_id       uuid,
  student_name     text,
  route_name       text,
  school_name      text,
  departure_time   time,
  vehicle_nickname text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite      public.invites%rowtype;
  v_guardian_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  -- `for update` bloquea la fila para serializar canjes concurrentes del mismo
  -- token: dos usuarios abriendo el link a la vez no pueden consumirlo ambos.
  select * into v_invite
  from public.invites i
  where i.id = p_token
    and i.expires_at > now()
  for update;

  if not found then
    raise exception 'invite_not_found_or_expired' using errcode = 'P0002';
  end if;

  -- Un solo uso: si ya la canjeó OTRO usuario, se rechaza antes de crear
  -- ningún vínculo. El mismo usuario puede reabrir su propio link (idempotente).
  if v_invite.consumed_at is not null
     and v_invite.consumed_by is distinct from auth.uid() then
    raise exception 'invite_already_used' using errcode = 'P0001';
  end if;

  insert into public.guardians (user_id, full_name)
  values (auth.uid(), coalesce(nullif(trim(p_full_name), ''), 'Apoderado'))
  on conflict (user_id) do update
    set full_name = excluded.full_name
  returning id into v_guardian_id;

  -- Marca la invitación como consumida por este usuario (solo la primera vez).
  update public.invites
    set consumed_at = now(),
        consumed_by = auth.uid()
  where id = v_invite.id
    and consumed_at is null;

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
