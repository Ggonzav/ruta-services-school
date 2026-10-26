-- Suscripciones privadas, sólo administradas por RPC con ownership explícito.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}={0,2}$'),
  updated_at timestamptz not null default now()
);
create table public.push_subscription_students (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (subscription_id, student_id)
);
create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.trip_events(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  target_revision bigint not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  sent_at timestamptz,
  discarded_at timestamptz,
  last_status integer,
  created_at timestamptz not null default now(),
  unique (event_id, subscription_id, target_revision)
);
create index push_deliveries_pending on public.push_deliveries(available_at)
  where sent_at is null and discarded_at is null;
alter table public.push_subscriptions enable row level security;
alter table public.push_subscription_students enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_subscriptions, public.push_subscription_students, public.push_deliveries from public, anon, authenticated;

create function public.register_push_subscription(p_student_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid; sub_id uuid;
begin
  g := public.current_guardian_id();
  if g is null or not public.is_guardian_of_student(p_student_id) then
    raise exception 'not_your_student' using errcode = '42501';
  end if;
  -- Limita destinos salientes para impedir SSRF. No se siguen redirecciones.
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^[:space:]#]+$' then
    raise exception 'unsupported_push_endpoint';
  end if;
  -- Serializa altas por familia para que el límite también aplique en concurrencia.
  perform 1 from public.guardians where id = g for update;
  select id into sub_id from public.push_subscriptions where endpoint = p_endpoint and guardian_id = g;
  if sub_id is null and (select count(*) from public.push_subscriptions where guardian_id = g) >= 10 then
    raise exception 'too_many_devices';
  end if;
  insert into public.push_subscriptions(guardian_id, endpoint, p256dh, auth)
    values (g, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now()
      where push_subscriptions.guardian_id = g
    returning id into sub_id;
  if sub_id is null then raise exception 'subscription_owned_by_another_user' using errcode = '42501'; end if;
  insert into public.push_subscription_students values (sub_id, p_student_id) on conflict do nothing;
  return sub_id;
end $$;
create function public.unregister_push_subscription(p_student_id uuid, p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscription_students ss using public.push_subscriptions s
    where ss.subscription_id = s.id and s.endpoint = p_endpoint
      and s.guardian_id = public.current_guardian_id() and ss.student_id = p_student_id;
  delete from public.push_subscriptions s where s.endpoint = p_endpoint
    and s.guardian_id = public.current_guardian_id()
    and not exists (select 1 from public.push_subscription_students ss where ss.subscription_id = s.id);
end $$;
revoke all on function public.register_push_subscription(uuid,text,text,text), public.unregister_push_subscription(uuid,text) from public, anon;
grant execute on function public.register_push_subscription(uuid,text,text,text), public.unregister_push_subscription(uuid,text) to authenticated;

-- Encola en la misma transacción del evento. No se envían datos de alumnos al proveedor.
create function public.enqueue_approaching_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'approaching' and new.student_id is not null then
    insert into public.push_deliveries(event_id, subscription_id, target_revision)
      select new.id, s.id, target.revision from public.push_subscriptions s
      join public.push_subscription_students ss on ss.subscription_id = s.id
      join public.student_guardians sg on sg.guardian_id = s.guardian_id and sg.student_id = ss.student_id
      join public.trip_targets target on target.trip_id = new.trip_id and target.student_id = new.student_id
      join public.trips trip on trip.id = new.trip_id and trip.status = 'in_progress'
      where ss.student_id = new.student_id
      on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.enqueue_approaching_push() from public, anon, authenticated;
create trigger enqueue_approaching_push after insert or update of kind on public.trip_events
  for each row execute function public.enqueue_approaching_push();

-- Reclamo con lease de 2 minutos; otro worker no puede reclamar las mismas filas.
create function public.claim_push_deliveries()
returns table(delivery_id uuid, lease uuid, endpoint text, p256dh text, auth text, student_id uuid, event_id uuid, kind public.route_kind)
language plpgsql security definer set search_path = public as $$
begin
  -- Limpieza acotada por antigüedad, incluso en periodos sin recorridos.
  delete from public.push_deliveries d where d.created_at < now() - interval '7 days';
  update public.push_deliveries d set discarded_at = now()
    where d.sent_at is null and d.discarded_at is null and (
      d.created_at < now() - interval '5 minutes' or (d.attempts >= 5 and d.available_at <= now())
      or not exists (
        select 1 from public.trip_events e
        join public.trips t on t.id = e.trip_id
        join public.trip_targets target on target.trip_id = t.id and target.student_id = e.student_id and target.revision = d.target_revision
        join public.push_subscriptions s on s.id = d.subscription_id
        join public.push_subscription_students ss on ss.subscription_id = s.id and ss.student_id = e.student_id
        join public.student_guardians sg on sg.guardian_id = s.guardian_id and sg.student_id = e.student_id
        where e.id = d.event_id and t.status = 'in_progress'
          and not exists (select 1 from public.trip_events done where done.trip_id = t.id
            and done.student_id = e.student_id and done.kind in ('picked_up','dropped_off','skipped'))
      )
    );
  return query
    with due as (
      select d.id from public.push_deliveries d
      where d.sent_at is null and d.discarded_at is null and d.available_at <= now()
      order by d.available_at limit 20 for update skip locked
    ), claimed as (
      update public.push_deliveries d set attempts = attempts + 1,
        available_at = now() + interval '2 minutes', lease_token = gen_random_uuid()
      from due where d.id = due.id returning d.*
    )
    select d.id, d.lease_token, s.endpoint, s.p256dh, s.auth, e.student_id, e.id, r.kind
    from claimed d join public.push_subscriptions s on s.id = d.subscription_id
    join public.trip_events e on e.id = d.event_id
    join public.trips t on t.id = e.trip_id join public.routes r on r.id = t.route_id;
end $$;
create function public.complete_push_delivery(p_id uuid, p_lease uuid, p_status integer)
returns void language plpgsql security definer set search_path = public as $$
declare sub_id uuid;
begin
  select subscription_id into sub_id from public.push_deliveries
    where id = p_id and lease_token = p_lease and sent_at is null and discarded_at is null for update;
  if sub_id is null then return; end if;
  if p_status in (404,410) then
    delete from public.push_subscriptions where id = sub_id;
    return;
  end if;
  update public.push_deliveries set last_status = p_status, lease_token = null,
    sent_at = case when p_status between 200 and 299 then now() else null end,
    discarded_at = case when p_status between 300 and 499 and p_status <> 429 then now() else null end,
    available_at = now() + interval '30 seconds' * greatest(1, attempts)
    where id = p_id;
end $$;
revoke all on function public.claim_push_deliveries(), public.complete_push_delivery(uuid,uuid,integer) from public, anon, authenticated;
-- PGlite no tiene service_role; en Supabase existe. No crear ni elevar roles aquí.
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_push_deliveries(), public.complete_push_delivery(uuid,uuid,integer) to service_role;
  end if;
end $$;

-- Revalidación por aviso inmediatamente antes de contactar al proveedor.
-- No se mantiene una transacción SQL abierta durante la petición HTTP.
create function public.authorize_push_delivery(p_id uuid, p_lease uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.push_deliveries d
    join public.trip_events e on e.id = d.event_id
    join public.trips t on t.id = e.trip_id and t.status = 'in_progress'
    join public.trip_targets target on target.trip_id = t.id
      and target.student_id = e.student_id and target.revision = d.target_revision
    join public.push_subscriptions s on s.id = d.subscription_id
    join public.push_subscription_students ss on ss.subscription_id = s.id and ss.student_id = e.student_id
    join public.student_guardians sg on sg.guardian_id = s.guardian_id and sg.student_id = e.student_id
    where d.id = p_id and d.lease_token = p_lease
      and d.sent_at is null and d.discarded_at is null
      and d.available_at > now() and d.created_at >= now() - interval '5 minutes'
      and not exists (select 1 from public.trip_events done where done.trip_id = t.id
        and done.student_id = e.student_id and done.kind in ('picked_up','dropped_off','skipped'))
  );
$$;
revoke all on function public.authorize_push_delivery(uuid,uuid) from public, anon, authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.authorize_push_delivery(uuid,uuid) to service_role;
  end if;
end $$;

-- Nuevo GPS cercano puede encolar una revisión nueva; misma revisión se deduplica.
create or replace function public.persist_target_eta(p_trip_id uuid,p_student_id uuid,p_revision bigint,
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
      on conflict(trip_id,student_id) where kind='approaching' do update set kind=excluded.kind;
  end if;
  return true;
end; $$;
