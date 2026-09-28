// ============================================================================
// Glue del navegador: lee la URL, habla con Supabase, pinta el DOM. Todo lo
// que tiene lógica real (armar la línea de tiempo, formatear el ETA,
// recordar qué alumno ya se canjeó) vive en los módulos puros de al lado
// y está testeado; este archivo sólo los conecta. No tiene test propio
// por la misma razón que backgroundLocation.ts en la app del conductor:
// es 100% integración con el navegador/Supabase.
// ============================================================================

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { buildTimeline, connectionState, formatEtaMinutes, type TripEventRow } from './eta-view';
import { loadRedeemedStudents, saveRedeemedStudent, type RedeemedStudent } from './local-students';
import { parseInviteToken } from './router';
import { fetchTripSnapshot, type TripMapSnapshot, type TripStatus } from './trip-data';
import { tripClock } from '../../../shared/trip-clock';

declare global {
  interface Window {
    APP_CONFIG?: { supabaseUrl: string; supabaseAnonKey: string; mapboxPublicToken?: string };
    L?: any;
  }
}

const root = document.getElementById('app')!;
let realtimeChannel: RealtimeChannel | null = null;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let refreshVersion = 0;
let leafletMap: any = null;
let vehicleMarker: any = null;
let stopMarker: any = null;
let schoolMarker: any = null;
let routeLine: any = null;
let routeGeometryCacheKey = '';
let routeGeometryCache: [number, number][] | null = null;

const config = window.APP_CONFIG;
if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
  renderFatalError('Falta config.js con supabaseUrl y supabaseAnonKey. Ver apps/web-apoderado/README.md.');
  throw new Error('missing_config');
}

const supabase: SupabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

main().catch((err) => {
  console.error(err);
  renderFatalError('Algo no funcionó. Vuelve a abrir el link que te mandó el transportista.');
});

async function main() {
  const inviteToken = parseInviteToken(window.location.pathname);

  if (inviteToken) {
    await handleInvite(inviteToken);
    return;
  }

  const stored = loadRedeemedStudents();
  if (stored.length > 0) {
    renderEtaView(stored[0]);
    return;
  }

  renderFatalError('Este link no es válido. Pide al transportista que te reenvíe la invitación.');
}

// ---------------------------------------------------------------------------
// Pantalla 7: invitación
// ---------------------------------------------------------------------------

async function handleInvite(token: string) {
  const { data: existing } = await supabase.auth.getSession();
  const already = loadRedeemedStudents();

  // Si esta sesión ya canjeó este link antes (recargó la página, por
  // ejemplo), no le volvemos a pedir el nombre.
  if (existing.session) {
    const known = already[0]; // best-effort: MVP no distingue "cuál alumno es este token"  sin volver a pedir el server
    if (known) {
      renderEtaView(known);
      return;
    }
  }

  root.innerHTML = `
    <div class="invite">
      <div class="brand">🚌 RutaSegura</div>
      <h1>Sigue el recorrido</h1>
      <p class="muted">El transportista te invitó. Verás cuánto falta para que llegue a tu casa y cuándo tu hijo o hija sube y llega al colegio.</p>
      <form id="invite-form">
        <label for="nombre">Tu nombre</label>
        <input id="nombre" name="nombre" type="text" placeholder="Nombre y apellido" required />
        <label class="checkbox">
          <input type="checkbox" id="terminos" required />
          Acepto los términos y la política de privacidad. Solo veré los datos de mi hijo o hija.
        </label>
        <button type="submit">Ver recorrido</button>
        <p id="invite-error" class="error" hidden></p>
      </form>
    </div>
  `;

  const form = document.getElementById('invite-form') as HTMLFormElement;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const button = form.querySelector('button')!;
    const errorEl = document.getElementById('invite-error')!;
    button.setAttribute('disabled', 'true');
    errorEl.hidden = true;

    try {
      if (!(await supabase.auth.getSession()).data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }

      const nombre = (document.getElementById('nombre') as HTMLInputElement).value;
      const { data, error } = await supabase.rpc('redeem_invite', {
        p_token: token,
        p_full_name: nombre,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const student: RedeemedStudent = {
        studentId: row.student_id,
        studentName: row.student_name,
        routeName: row.route_name,
        schoolName: row.school_name,
        redeemedAt: new Date().toISOString(),
      };
      saveRedeemedStudent(student);
      history.replaceState(null, '', '/');
      renderEtaView(student);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '';
      errorEl.textContent = message.includes('Anonymous sign-ins are disabled')
        ? 'Falta activar el login anónimo en Supabase para que el apoderado pueda abrir este link.'
        : 'No pudimos validar la invitación. ¿El link sigue vigente?';
      errorEl.hidden = false;
      button.removeAttribute('disabled');
    }
  });
}

// ---------------------------------------------------------------------------
// Pantalla 8: ETA en vivo
// ---------------------------------------------------------------------------

function renderEtaView(student: RedeemedStudent) {
  const firstName = student.studentName.split(' ')[0];

  root.innerHTML = `
    <div class="eta">
      <div class="brand-row">
        <div class="brand">🚌 RutaSegura</div>
      </div>
      <h1>${escapeHtml(firstName)}</h1>
      <div class="eta-card">
        <div class="eta-route" id="eta-route">Calculando recorrido…</div>
        <div class="eta-label">Calculando recorrido…</div>
        <div class="eta-minutes" id="eta-minutes">—</div>
        <div class="eta-freshness" id="eta-freshness"></div>
      </div>
      <div class="map-card">
        <div class="map-heading">
          <div>
            <div class="map-kicker">Seguimiento</div>
            <div class="map-title">Ubicación en vivo</div>
          </div>
          <div class="map-live-pill">● En vivo</div>
        </div>
        <div id="live-map" class="live-map">
          <div class="map-empty">Esperando ubicación del furgón…</div>
        </div>
      </div>
      <div class="timeline" id="timeline"></div>
      <div class="push-card">
        <div class="push-title">Recibe avisos aunque cierres esta página</div>
        <button id="enable-notifications">Activar avisos</button>
        <p class="muted small">En iPhone, primero agrega esta página a tu pantalla de inicio.</p>
      </div>
      <div class="absence-card">
        <div class="push-title">¿Hoy no viaja?</div>
        <button id="mark-absence" class="secondary">Hoy no viaja</button>
        <p id="absence-msg" class="muted small" hidden>Avisado. El transportista ya lo ve.</p>
      </div>
    </div>
  `;
  leafletMap = null;
  vehicleMarker = null;
  stopMarker = null;
  schoolMarker = null;
  routeLine = null;

  document.getElementById('enable-notifications')!.addEventListener('click', enableBestEffortNotifications);
  document.getElementById('mark-absence')!.addEventListener('click', () => markAbsence(student.studentId));

  clearInterval(refreshTimer);
  void refreshOnce(student);
  subscribeRealtime(student);
  // Polling also handles reconnects, day/turn changes, and absent Realtime setup.
  refreshTimer = setInterval(() => void refreshOnce(student), 15_000);
}

async function refreshOnce(student: RedeemedStudent) {
  const version = ++refreshVersion;
  try {
    const snapshot = await fetchTripSnapshot(supabase, student.studentId);
    if (version !== refreshVersion) return;
    const viewPhase = routeViewPhase(snapshot.events, student.studentId, snapshot.direction, snapshot.status);
    paintEta(snapshot.etaSeconds, snapshot.updatedAt, snapshot.status, snapshot.direction, viewPhase);
    void paintMap(snapshot.map, viewPhase);
    paintTimeline(snapshot.events, student, snapshot.direction);
  } catch (err) {
    if (version !== refreshVersion) return;
    console.error(err);
    document.getElementById('eta-minutes')!.textContent = '—';
    document.getElementById('eta-freshness')!.textContent = 'No pudimos actualizar el recorrido. Reintentando…';
  }
}

type RouteViewPhase = 'to_pickup' | 'to_school' | 'to_home' | 'finished';

function routeViewPhase(
  events: TripEventRow[],
  studentId: string,
  direction: 'to_school' | 'to_home',
  tripStatus: TripStatus
): RouteViewPhase {
  if (tripStatus === 'finished' || tripStatus === 'canceled') return 'finished';
  const has = (kind: TripEventRow['kind']) => events.some((event) => event.kind === kind && event.student_id === studentId);
  if (direction === 'to_school') {
    if (has('picked_up')) return 'to_school';
    if (has('skipped')) return 'finished';
    return 'to_pickup';
  }
  if (has('dropped_off') || has('skipped')) return 'finished';
  return 'to_home';
}

async function paintMap(map: TripMapSnapshot | null, phase: RouteViewPhase) {
  const el = document.getElementById('live-map');
  if (!el) return;
  if (!map) {
    el.innerHTML = '<div class="map-empty">Esperando recorrido…</div>';
    return;
  }

  const L = window.L;
  if (!L) {
    el.innerHTML = '<div class="map-empty">No se pudo cargar el mapa. El ETA sigue funcionando.</div>';
    return;
  }

  if (!leafletMap) {
    el.innerHTML = '';
    leafletMap = L.map(el, { zoomControl: false, attributionControl: false });
    const mapboxToken = config.mapboxPublicToken?.trim();
    const tileUrl = mapboxToken
      ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(mapboxToken)}`
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    const attribution = mapboxToken
      ? '© Mapbox © OpenStreetMap'
      : '© OpenStreetMap © CARTO';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution,
    }).addTo(leafletMap);
    L.control.attribution({ prefix: false }).addTo(leafletMap);
  }

  const stopLatLng = [map.stop.lat, map.stop.lng];
  const schoolLatLng = [map.school.lat, map.school.lng];
  const vehicleLatLng = map.vehicle ? [map.vehicle.lat, map.vehicle.lng] : null;
  const target = mapTargetForPhase(phase);
  const originLatLng = vehicleLatLng ?? target.fallbackOrigin(stopLatLng, schoolLatLng);
  const destinationLatLng = target.destination(stopLatLng, schoolLatLng);

  stopMarker ??= L.marker(stopLatLng, { icon: mapIcon('🏠') }).addTo(leafletMap);
  schoolMarker ??= L.marker(schoolLatLng, { icon: mapIcon('🏫') }).addTo(leafletMap);
  stopMarker.setLatLng(stopLatLng).bindPopup(`Casa: ${escapeHtml(map.stop.address)}`);
  schoolMarker.setLatLng(schoolLatLng).bindPopup(`Colegio: ${escapeHtml(map.school.name)}`);

  const routePoints = await getRoutePoints(originLatLng, destinationLatLng);
  const linePoints = routePoints ?? [originLatLng, destinationLatLng];
  if (!routeLine) {
    routeLine = L.polyline(linePoints, { color: '#0b4f9f', weight: 6, opacity: 0.9, lineCap: 'round' }).addTo(leafletMap);
  } else {
    routeLine.setLatLngs(linePoints);
  }

  if (vehicleLatLng) {
    vehicleMarker ??= L.marker(vehicleLatLng, { icon: mapIcon('🚌', 'vehicle') }).addTo(leafletMap);
    vehicleMarker.setLatLng(vehicleLatLng).bindPopup(`Furgón · actualizado ${relativeTime(map.vehicle!.updatedAt)}`);
  }

  const bounds = L.latLngBounds(linePoints);
  leafletMap.fitBounds(bounds.pad(0.25), { animate: false, maxZoom: 16 });
  setMapFooter(map, target.label);
}

function mapTargetForPhase(phase: RouteViewPhase) {
  if (phase === 'to_school') {
    return {
      label: 'camino al colegio',
      fallbackOrigin: (stop: number[], _school: number[]) => stop,
      destination: (_stop: number[], school: number[]) => school,
    };
  }
  if (phase === 'to_home' || phase === 'to_pickup') {
    return {
      label: 'camino a casa',
      fallbackOrigin: (_stop: number[], school: number[]) => school,
      destination: (stop: number[], _school: number[]) => stop,
    };
  }
  return {
    label: 'recorrido finalizado',
    fallbackOrigin: (stop: number[], _school: number[]) => stop,
    destination: (stop: number[], _school: number[]) => stop,
  };
}

async function getRoutePoints(originLatLng: number[], destinationLatLng: number[]): Promise<[number, number][] | null> {
  const mapboxToken = config.mapboxPublicToken?.trim();
  if (!mapboxToken) return null;

  const rounded = [...originLatLng, ...destinationLatLng].map((value) => value.toFixed(5)).join(',');
  if (rounded === routeGeometryCacheKey) return routeGeometryCache;

  routeGeometryCacheKey = rounded;
  routeGeometryCache = null;

  const origin = `${originLatLng[1]},${originLatLng[0]}`;
  const destination = `${destinationLatLng[1]},${destinationLatLng[0]}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${origin};${destination}`);
  url.searchParams.set('access_token', mapboxToken);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');

  try {
    const res = await fetch(url);
    const payload = await res.json();
    const coordinates = payload?.routes?.[0]?.geometry?.coordinates;
    if (!res.ok || !Array.isArray(coordinates)) return null;
    routeGeometryCache = coordinates
      .map((coord: unknown[]) => [Number(coord[1]), Number(coord[0])] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    return routeGeometryCache.length > 1 ? routeGeometryCache : null;
  } catch (err) {
    console.warn('No se pudo cargar ruta Mapbox Directions', err);
    return null;
  }
}

function mapIcon(emoji: string, kind = '') {
  return window.L!.divIcon({
    className: `rs-map-marker ${kind}`,
    html: `<span>${emoji}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function setMapFooter(map: TripMapSnapshot, targetLabel: string) {
  const card = document.querySelector('.map-card');
  if (!card) return;
  let footer = document.getElementById('map-updated');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'map-updated';
    footer.className = 'map-updated';
    card.appendChild(footer);
  }
  footer.textContent = map.vehicle
    ? `Furgón ${targetLabel} · actualizado ${relativeTime(map.vehicle.updatedAt)}`
    : 'Esperando GPS del conductor';
}

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return 'recién';
  if (seconds < 60) return `hace ${seconds}s`;
  return `hace ${Math.round(seconds / 60)} min`;
}

function subscribeRealtime(student: RedeemedStudent) {
  realtimeChannel?.unsubscribe();

  realtimeChannel = supabase
    .channel(`apoderado:${student.studentId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_stop_eta', filter: `student_id=eq.${student.studentId}` },
      () => void refreshOnce(student)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_vehicle_location' },
      () => void refreshOnce(student)
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'trip_events' },
      () => refreshOnce(student)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trips' },
      () => void refreshOnce(student)
    )
    .subscribe();
}

function paintEta(etaSeconds: number | null, updatedAt: string | null, tripStatus: TripStatus, direction: 'to_school' | 'to_home', phase: RouteViewPhase) {
  const routeEl = document.getElementById('eta-route');
  if (routeEl) {
    routeEl.textContent = direction === 'to_school' ? 'Ida al colegio' : 'Vuelta a casa';
  }

  const labelEl = document.querySelector('.eta-label');
  if (labelEl) {
    labelEl.textContent = etaLabelForPhase(phase);
  }

  document.getElementById('eta-minutes')!.textContent = phase === 'finished' ? '—' : formatEtaMinutes(etaSeconds);

  const state = connectionState({ tripStatus, lastEtaUpdatedAt: updatedAt, nowMs: Date.now() });
  const freshnessEl = document.getElementById('eta-freshness')!;
  freshnessEl.textContent =
    state === 'live'
      ? 'Actualizado hace unos segundos'
      : state === 'stale'
        ? 'No se actualiza hace un rato — puede que el furgón haya perdido señal'
        : state === 'connecting'
          ? 'Esperando que el conductor inicie el recorrido'
          : 'Recorrido finalizado';
}

function etaLabelForPhase(phase: RouteViewPhase): string {
  if (phase === 'to_pickup') return 'El furgón llega a tu casa en';
  if (phase === 'to_school') return 'Tu hijo va camino al colegio';
  if (phase === 'to_home') return 'Tu hijo llega a casa en';
  return 'Recorrido finalizado';
}

function paintTimeline(events: TripEventRow[], student: RedeemedStudent, direction: 'to_school' | 'to_home') {
  const firstName = student.studentName.split(' ')[0];
  const steps = buildTimeline(events, student.studentId, firstName, direction);
  const el = document.getElementById('timeline')!;
  el.innerHTML = steps
    .map(
      (s) => `
        <div class="step ${s.done ? 'done' : ''}">
          <div class="dot"></div>
          <div class="step-label">${escapeHtml(s.label)}</div>
          <div class="step-time">${s.time ?? ''}</div>
        </div>`
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Avisos: mejor esfuerzo con Notification API mientras la pestaña está
// abierta. Un push de verdad con la página cerrada requiere Service Worker
// + VAPID + un envío del lado del servidor — ver docs/ARQUITECTURA.md
// ("Web push, no incluido en este MVP"): el respaldo del piloto es
// WhatsApp/SMS.
// ---------------------------------------------------------------------------

async function enableBestEffortNotifications() {
  if (!('Notification' in window)) {
    alert('Este navegador no soporta notificaciones. Te recomendamos dejar la pestaña abierta.');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  new Notification('Listo', { body: 'Te avisaremos mientras tengas esta página abierta.' });
}

async function markAbsence(studentId: string) {
  const { date: today, kind } = tripClock();
  const { error } = await supabase.rpc('mark_absence', {
    p_student_id: studentId,
    p_absence_date: today,
    p_route_kind: kind,
  });
  if (error) {
    console.error(error);
    return;
  }
  const msg = document.getElementById('absence-msg')!;
  msg.hidden = false;
}

function renderFatalError(message: string) {
  root.innerHTML = `<div class="invite"><p class="error">${escapeHtml(message)}</p></div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
