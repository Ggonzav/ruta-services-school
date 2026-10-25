-- La invitación identifica al alumno por token y al apoderado por el nombre
-- registrado por el transportista. La comparación ignora mayúsculas y
-- espacios repetidos, pero nunca revela el nombre esperado al cliente.
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
  v_invite public.invites%rowtype;
  v_guardian_id uuid;
  v_expected_guardian_name text;
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

  select sp.guardian_name into v_expected_guardian_name
  from public.student_profiles sp
  where sp.student_id = v_invite.student_id;

  if not found or coalesce(btrim(v_expected_guardian_name), '') = '' then
    raise exception 'guardian_identity_not_configured' using errcode = 'P0002';
  end if;

  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'guardian_name_required' using errcode = '22023';
  end if;

  if lower(regexp_replace(btrim(p_full_name), '[[:space:]]+', ' ', 'g')) <>
     lower(regexp_replace(btrim(v_expected_guardian_name), '[[:space:]]+', ' ', 'g')) then
    raise exception 'guardian_name_mismatch' using errcode = '22023';
  end if;

  insert into public.guardians (user_id, full_name)
  values (auth.uid(), btrim(v_expected_guardian_name))
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
