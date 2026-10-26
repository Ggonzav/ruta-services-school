-- ============================================================================
-- 0015_driver_card.sql
-- Tarjeta del conductor que ve el apoderado (nombre, teléfono y foto) para
-- confirmar quién maneja y poder llamar.
--
-- Los datos reutilizan `carriers.full_name` y `carriers.phone`; solo se agrega
-- `photo_url`. El apoderado NO puede leer la tabla `carriers` (su RLS es
-- self-only), así que accede a estos tres campos —y nada más— vía una RPC
-- SECURITY DEFINER autorizada POR EL RECORRIDO: solo responde si quien llama
-- es apoderado de un alumno con parada en ese trip.
-- ============================================================================

alter table public.carriers add column photo_url text;

create function public.guardian_trip_driver(p_trip_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.guardian_has_stop_in_trip(p_trip_id) then (
      select jsonb_build_object(
        'name', c.full_name,
        'phone', c.phone,
        'photoUrl', c.photo_url
      )
      from public.trips t
      join public.routes r on r.id = t.route_id
      join public.vehicles v on v.id = r.vehicle_id
      join public.carriers c on c.id = v.carrier_id
      where t.id = p_trip_id
    )
    else null
  end;
$$;

revoke all on function public.guardian_trip_driver(uuid) from public, anon;
grant execute on function public.guardian_trip_driver(uuid) to authenticated;
