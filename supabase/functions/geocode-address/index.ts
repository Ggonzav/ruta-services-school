// ============================================================================
// Edge Function: geocode-address
//
// Convierte una dirección escrita en coordenadas usando Mapbox Geocoding.
// Uso MVP: pantallas/admin/scripts llaman esta función antes de guardar
// route_stops.lat/lng o routes.school_lat/school_lng.
//
// Deploy: supabase functions deploy geocode-address
// Config: supabase secrets set MAPBOX_ACCESS_TOKEN=...
// ============================================================================

interface GeocodeBody {
  address: string;
  country?: string;
  proximity_lng?: number;
  proximity_lat?: number;
  limit?: number;
}

const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'auth_required' }, 401);

  let body: GeocodeBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const address = body.address?.trim();
  if (!address) return json({ error: 'address_required' }, 400);
  if (!MAPBOX_ACCESS_TOKEN) return json({ error: 'mapbox_token_missing' }, 500);

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set('access_token', MAPBOX_ACCESS_TOKEN);
  url.searchParams.set('language', 'es');
  url.searchParams.set('limit', String(Math.min(Math.max(body.limit ?? 5, 1), 10)));
  url.searchParams.set('types', 'address,poi,place,locality,neighborhood');
  url.searchParams.set('country', body.country ?? 'cl');
  if (typeof body.proximity_lng === 'number' && typeof body.proximity_lat === 'number') {
    url.searchParams.set('proximity', `${body.proximity_lng},${body.proximity_lat}`);
  }

  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) {
    return json({ error: 'geocoding_failed', detail: payload?.message ?? res.statusText }, 502);
  }

  const candidates = (payload.features ?? [])
    .map((feature: any) => ({
      label: feature.place_name,
      lat: feature.center?.[1],
      lng: feature.center?.[0],
      relevance: feature.relevance,
      mapboxId: feature.id,
    }))
    .filter((candidate: any) => typeof candidate.lat === 'number' && typeof candidate.lng === 'number');

  return json({ ok: true, address, candidates });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
