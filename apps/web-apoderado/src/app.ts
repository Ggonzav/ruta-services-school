// ============================================================================
// Glue del navegador: lee la URL, habla con Supabase, pinta el DOM. Todo lo
// que tiene lógica real (armar la línea de tiempo, formatear el ETA,
// recordar qué alumno ya se canjeó) vive en los módulos puros de al lado
// y está testeado; este archivo sólo los conecta. No tiene test propio
// por la misma razón que backgroundLocation.ts en la app del conductor:
// es 100% integración con el navegador/Supabase.
// ============================================================================

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { buildTimeline, boardingStatus, boardingStatusLabel, formatEtaMinutes, type TripEventRow } from './eta-view';
import { loadRedeemedStudents, saveRedeemedStudent, type RedeemedStudent } from './local-students';
import { parseInviteToken } from './router';
import { fetchTripSnapshot, type TripMapSnapshot, type TripSnapshot } from './trip-data';
import { tripClock } from '../../../shared/trip-clock';
import { kindForDirection, type RouteKind } from '../../../shared/rutasegura-api';

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
let mapVersion = 0;
// Turno (AM/PM) del recorrido que el apoderado tiene EN PANTALLA. Se usa para
// que "Hoy no viaja" marque la ausencia del turno correcto en vez de inferirlo
// del reloj (si ve la ida AM pasadas las 13:00, debe marcar AM, no PM).
// null = no hay recorrido mostrado → se cae al turno del reloj.
let activeRouteKind: RouteKind | null = null;
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
  // El alumno de una invitación lo determina redeem_invite, nunca el caché local.
  // Incluso con sesión existente, validar este token antes de mostrar datos.
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
    activeRouteKind = snapshot.tripId ? kindForDirection(snapshot.direction) : null;
    const mode = viewMode(snapshot, student.studentId);
    paintEtaCard(snapshot, student.studentId, mode);
    void paintMap(snapshot.map, mode);
    paintTimeline(snapshot.events, student, snapshot.direction);
  } catch (err) {
    if (version !== refreshVersion) return;
    console.error(err);
    mapVersion++;
    routeLine?.remove();
    routeLine = null;
    const card = document.querySelector('.eta-card');
    if (card) card.innerHTML = '<div class="eta-headline">No pudimos actualizar el recorrido. Reintentando…</div>';
  }
}

type ViewMode = 'connecting' | 'finished' | 'next' | 'waiting';
function viewMode(snapshot: TripSnapshot, studentId: string): ViewMode {
  if (!snapshot.status || snapshot.status === 'scheduled') return 'connecting';
  if (snapshot.status === 'finished' || snapshot.status === 'canceled') return 'finished';
  if (snapshot.events.some(e => e.student_id === studentId && (e.kind === 'skipped' || e.kind === 'dropped_off'))) return 'finished';
  return snapshot.isNext ? 'next' : 'waiting';
}
async function paintMap(map: TripMapSnapshot | null, mode: ViewMode) {
  const version = ++mapVersion;
  if (mode !== "next" || !map?.vehicle) { routeLine?.remove(); routeLine = null; }
  const el = document.getElementById("live-map");
  if (!el) return;
  if (!map) {
    el.innerHTML = '<div class="map-empty">Esperando recorrido\u2026</div>';
    return;
  }
  const L = window.L;
  if (!L) {
    el.innerHTML = '<div class="map-empty">No se pudo cargar el mapa. El ETA sigue funcionando.</div>';
    return;
  }
  if (!leafletMap) {
    el.innerHTML = "";
    leafletMap = L.map(el, { zoomControl: false, attributionControl: false });
    const mapboxToken = config?.mapboxPublicToken?.trim();
    const tileUrl = mapboxToken ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(mapboxToken)}` : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    const attribution = mapboxToken ? "\xA9 Mapbox \xA9 OpenStreetMap" : "\xA9 OpenStreetMap \xA9 CARTO";
    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution
    }).addTo(leafletMap);
    L.control.attribution({ prefix: false }).addTo(leafletMap);
  }
  const stopLatLng = [map.stop.lat, map.stop.lng];
  const schoolLatLng = [map.school.lat, map.school.lng];
  const vehicleLatLng = map.vehicle ? [map.vehicle.lat, map.vehicle.lng] : null;
  stopMarker ?? (stopMarker = L.marker(stopLatLng, { icon: mapIcon("\u{1F3E0}") }).addTo(leafletMap));
  schoolMarker ?? (schoolMarker = L.marker(schoolLatLng, { icon: mapIcon("\u{1F3EB}") }).addTo(leafletMap));
  stopMarker.setLatLng(stopLatLng).bindPopup(`Casa: ${escapeHtml(map.stop.address)}`);
  schoolMarker.setLatLng(schoolLatLng).bindPopup(`Colegio: ${escapeHtml(map.school.name)}`);
  if (vehicleLatLng) {
    vehicleMarker ?? (vehicleMarker = L.marker(vehicleLatLng, { icon: mapIcon("\u{1F68C}", "vehicle") }).addTo(leafletMap));
    vehicleMarker.setLatLng(vehicleLatLng).bindPopup(`Furg\xF3n \xB7 actualizado ${relativeTime(map.vehicle!.updatedAt)}`);
  }
  if (!vehicleLatLng && vehicleMarker) { vehicleMarker.remove(); vehicleMarker = null; }
  if (mode === "next" && vehicleLatLng) {
    const originLatLng = vehicleLatLng ?? stopLatLng;
    const routePoints = await getRoutePoints(originLatLng, stopLatLng);
    if (version !== mapVersion) return;
    const linePoints = routePoints ?? [originLatLng, stopLatLng];
    if (!routeLine) {
      routeLine = L.polyline(linePoints, { color: "#0b4f9f", weight: 6, opacity: 0.9, lineCap: "round" }).addTo(leafletMap);
    } else {
      routeLine.setLatLngs(linePoints);
    }
  } else if (routeLine) {
    routeLine.remove();
    routeLine = null;
  }
  const framePoints = vehicleLatLng ? [stopLatLng, schoolLatLng, vehicleLatLng] : [stopLatLng, schoolLatLng];
  const bounds = L.latLngBounds(framePoints);
  leafletMap.fitBounds(bounds.pad(0.25), { animate: false, maxZoom: 16 });
  setMapFooter(map);
}
async function getRoutePoints(originLatLng: number[], destinationLatLng: number[]): Promise<[number, number][] | null> {
  const mapboxToken = config?.mapboxPublicToken?.trim();
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
    const points: [number, number][] = coordinates
      .map((coord: unknown[]) => [Number(coord[1]), Number(coord[0])] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (routeGeometryCacheKey === rounded) routeGeometryCache = points;
    return points.length > 1 ? points : null;
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

function setMapFooter(map: TripMapSnapshot) {
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
    ? `Ubicación actualizada ${relativeTime(map.vehicle!.updatedAt)}`
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

function paintEtaCard(snapshot: TripSnapshot, studentId: string, mode: ViewMode) {
  const card = document.querySelector(".eta-card");
  if (!card) return;
  card.classList.toggle("calm", mode !== "next");
  const fresh = freshnessLine(snapshot);
  if (mode === "next") {
    const route = snapshot.direction === "to_school" ? "Ida al colegio" : "Vuelta a casa";
    card.innerHTML = `
      <div class="eta-route">${route}</div>
      <div class="eta-label">El furg\xF3n va hacia tu casa</div>
      <div class="eta-minutes">${escapeHtml(formatEtaMinutes(snapshot.updatedAt && Date.now() - Date.parse(snapshot.updatedAt) < 120_000 ? snapshot.etaSeconds : null))}</div>
      <div class="eta-freshness">${escapeHtml(fresh)}</div>`;
    return;
  }
  if (mode === "waiting") {
    const status = boardingStatusLabel(
      boardingStatus(snapshot.events, studentId, snapshot.direction),
      snapshot.direction
    );
    card.innerHTML = `
      <div class="eta-headline">\u{1F68C} El furg\xF3n est\xE1 en recorrido</div>
      <div class="eta-sub">El conductor est\xE1 atendiendo otras paradas. El mapa mostrará la ruta hacia tu casa cuando sea la próxima parada.</div>
      <div class="eta-chip">${escapeHtml(status)}</div>
      <div class="eta-pending">Horario de llegada pendiente de confirmar</div>
      <div class="eta-freshness">${escapeHtml(fresh)}</div>`;
    return;
  }
  if (mode === "connecting") {
    card.innerHTML = `<div class="eta-headline">Esperando que el conductor inicie el recorrido</div>`;
    return;
  }
  const skipped = snapshot.events.some(e => e.student_id === studentId && e.kind === 'skipped');
  const label = snapshot.status === 'canceled' ? 'Recorrido cancelado' : skipped ? 'Hoy no viaja' : 'Recorrido finalizado';
  card.innerHTML = `<div class="eta-headline">${label}</div>`;
}
function freshnessLine(snapshot: TripSnapshot) {
  const v = snapshot.map?.vehicle;
  if (v) return `Ubicaci\xF3n actualizada ${relativeTime(v.updatedAt)}`;
  if (snapshot.status === "in_progress") return "Sin se\xF1al del furg\xF3n por ahora";
  return "Esperando que el conductor comparta su ubicaci\xF3n";
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
  const { date: today, kind: clockKind } = tripClock();
  // El turno del recorrido mostrado manda; el reloj es solo el respaldo cuando
  // todavía no hay recorrido en pantalla (p. ej. avisar la noche anterior).
  const kind = activeRouteKind ?? clockKind;
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
