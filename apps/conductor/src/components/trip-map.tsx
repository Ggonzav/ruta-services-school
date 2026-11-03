import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View, Text } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, radius } from '@/lib/theme';
import {
  fallbackMapTileProvider,
  isAllowedMapAttributionUrl,
  resolveMapTileProvider,
  type MapTileProvider,
} from '@/lib/mapConfig';
import { tripMapMarkerVisuals, type TripMapStop } from '@/lib/tripMapMarkers';

// Leaflet vive dentro del WebView. Los marcadores son SVG inline locales:
// no descargan imágenes de terceros y conservan el número original de parada.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TripMapProps {
  me: LatLng | null;
  school: LatLng | null;
  stops: TripMapStop[];
  height?: number;
}

const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';
const MAPBOX_ATTRIBUTION =
  '<a href="https://www.mapbox.com/about/maps/">© Mapbox</a> ' +
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> ' +
  '<a id="improve-map" href="https://apps.mapbox.com/feedback/">Improve this map</a>';

export function buildTripMapHtml(provider: MapTileProvider): string {
  const providerJson = JSON.stringify(provider);
  const fallbackProviderJson = JSON.stringify(fallbackMapTileProvider(provider));
  const markerVisualsJson = JSON.stringify(tripMapMarkerVisuals);
  const mapboxLogoStyles =
    provider.kind === 'mapbox'
      ? '<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css" />'
      : '';
  return `<!doctype html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com https://api.mapbox.com; img-src data: https://api.mapbox.com https://tile.openstreetmap.org" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
${mapboxLogoStyles}
<style>
  html, body, #map { margin: 0; height: 100%; width: 100%; background: ${colors.bg}; }
  .rs-marker { filter: drop-shadow(0 3px 5px rgba(27,42,91,.35)); }
  .rs-marker svg { display: block; overflow: visible; }
  #provider-logo { position: absolute; z-index: 800; left: 8px; bottom: 5px; }
  #provider-logo[hidden] { display: none; }
  #provider-attribution { position: absolute; z-index: 800; right: 0; bottom: 0; padding: 2px 5px;
    background: rgba(255,255,255,.82); color: #22304f; font: 9px/1.2 -apple-system, sans-serif; }
  #provider-attribution a { color: #22304f; text-decoration: none; }
  .leaflet-popup-content { margin: 10px 12px; font: 12px/1.35 -apple-system, sans-serif; color: #1b2a5b; }
</style>
</head><body>
<div id="map"></div>
<div id="provider-logo" hidden><a class="mapboxgl-ctrl-logo" href="https://www.mapbox.com/" aria-label="Mapbox"></a></div>
<div id="provider-attribution"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var provider = ${providerJson};
  var fallbackProvider = ${fallbackProviderJson};
  var mapboxAttribution = ${JSON.stringify(MAPBOX_ATTRIBUTION)};
  var osmAttribution = ${JSON.stringify(OSM_ATTRIBUTION)};
  var markerVisuals = ${markerVisualsJson};

  function notify(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
  }

  if (!window.L) {
    notify('error');
  } else {
  var map = L.map('map', { zoomControl: false, attributionControl: false });
  var tileLayer = null;
  var activeProvider = null;

  function updateAttribution(nextProvider) {
    var isMapbox = nextProvider.kind === 'mapbox';
    document.getElementById('provider-logo').hidden = !isMapbox;
    document.getElementById('provider-attribution').innerHTML = isMapbox ? mapboxAttribution : osmAttribution;
  }

  function useProvider(nextProvider) {
    if (tileLayer) map.removeLayer(tileLayer);
    activeProvider = nextProvider;
    updateAttribution(nextProvider);
    var tileErrors = 0;
    tileLayer = L.tileLayer(nextProvider.tileUrl, { maxZoom: 19 });
    tileLayer.on('tileerror', function () {
      tileErrors += 1;
      if (tileErrors !== 3) return;
      if (fallbackProvider && activeProvider.kind === 'mapbox') {
        var nextFallback = fallbackProvider;
        fallbackProvider = null;
        useProvider(nextFallback);
        notify('fallback');
      } else {
        notify('error');
      }
    });
    tileLayer.addTo(map);
  }

  useProvider(provider);
  map.setView([-33.45, -70.66], 12);

  map.on('moveend', function () {
    if (activeProvider.kind !== 'mapbox') return;
    var center = map.getCenter();
    var feedback = document.getElementById('improve-map');
    if (feedback) feedback.href = 'https://apps.mapbox.com/feedback/#/' + center.lng + '/' + center.lat + '/' + map.getZoom();
  });

  var markers = {};
  var stopColors = { next: markerVisuals.next.color, pending: markerVisuals.pending.color, completed: markerVisuals.completed.color, skipped: markerVisuals.skipped.color };
  var stopLabels = { next: markerVisuals.next.label, pending: markerVisuals.pending.label, completed: markerVisuals.completed.label, skipped: markerVisuals.skipped.label };

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function vehicleSvg() {
    return '<div class="rs-marker"><svg width="42" height="48" viewBox="0 0 42 48" aria-label="Furgón">' +
      '<path fill="' + markerVisuals.vehicle.color + '" stroke="#fff" stroke-width="2.5" d="M21 1.5C10.3 1.5 2 9.9 2 20.2 2 32.8 21 46.5 21 46.5S40 32.8 40 20.2C40 9.9 31.7 1.5 21 1.5Z"/>' +
      '<rect x="9" y="12" width="24" height="16" rx="4" fill="' + markerVisuals.vehicle.detail + '"/>' +
      '<rect x="12" y="15" width="7" height="5" rx="1.2" fill="' + markerVisuals.vehicle.color + '"/><rect x="23" y="15" width="7" height="5" rx="1.2" fill="' + markerVisuals.vehicle.color + '"/>' +
      '<circle cx="14" cy="29" r="3" fill="' + markerVisuals.vehicle.detail + '"/><circle cx="28" cy="29" r="3" fill="' + markerVisuals.vehicle.detail + '"/></svg></div>';
  }

  function schoolSvg() {
    return '<div class="rs-marker"><svg width="40" height="46" viewBox="0 0 40 46" aria-label="Colegio">' +
      '<path fill="' + markerVisuals.school.color + '" stroke="#fff" stroke-width="2.5" d="M20 1.5C9.7 1.5 2 9.3 2 19.3 2 31.2 20 44.5 20 44.5S38 31.2 38 19.3C38 9.3 30.3 1.5 20 1.5Z"/>' +
      '<path fill="#fff" d="M9 18.5 20 11l11 7.5v2H9v-2Zm2 3.5h3v8h-3v-8Zm7.5 0h3v8h-3v-8Zm7.5 0h3v8h-3v-8ZM8 31h24v2H8v-2Z"/></svg></div>';
  }

  function stopSvg(status, number) {
    var color = stopColors[status] || stopColors.pending;
    var check = markerVisuals[status].icon === 'house-check' ? '<path d="m25 11 2.5 2.5 5-5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' : '';
    return '<div class="rs-marker"><svg width="42" height="48" viewBox="0 0 42 48" aria-label="Parada ' + number + '">' +
      '<path fill="' + color + '" stroke="#fff" stroke-width="2.5" d="M21 1.5C10.3 1.5 2 9.9 2 20.2 2 32.8 21 46.5 21 46.5S40 32.8 40 20.2C40 9.9 31.7 1.5 21 1.5Z"/>' +
      '<path fill="#fff" d="m10 20 11-8 11 8-2 2-1.5-1.1V31h-15V20.9L12 22l-2-2Z"/>' +
      '<text x="21" y="29" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="10" font-weight="800" fill="' + color + '">' + number + '</text>' + check + '</svg></div>';
  }

  function icon(kind, number) {
    var iconName = markerVisuals[kind].icon;
    var html = iconName === 'bus-pin' ? vehicleSvg() : iconName === 'school' ? schoolSvg() : stopSvg(kind, number);
    return L.divIcon({ className: '', html: html, iconSize: [42,48], iconAnchor: [21,45], popupAnchor: [0,-42] });
  }

  function place(key, point, kind, number, popup, zIndexOffset) {
    if (!point) {
      if (markers[key]) { map.removeLayer(markers[key]); delete markers[key]; }
      return;
    }
    var latLng = [point.lat, point.lng];
    if (markers[key]) markers[key].setLatLng(latLng).setIcon(icon(kind, number));
    else markers[key] = L.marker(latLng, { icon: icon(kind, number), zIndexOffset: zIndexOffset || 0 }).addTo(map);
    if (popup) markers[key].bindPopup(popup, { autoClose: true, closeOnClick: true });
  }

  window.rsUpdate = function (data) {
    try {
      place('me', data.me, 'vehicle', null, '<b>Furgón</b><br>Tu ubicación actual', 1200);
      place('school', data.school, 'school', null, '<b>Colegio</b><br>Destino operativo', 900);

      Object.keys(markers).filter(function (key) { return key.indexOf('stop-') === 0; }).forEach(function (key) {
        map.removeLayer(markers[key]);
        delete markers[key];
      });
      (data.stops || []).forEach(function (stop) {
        var number = Number.isFinite(stop.number) ? stop.number : '';
        var popup = '<b>Parada ' + number + ' · ' + escapeHtml(stop.label) + '</b><br>' +
          escapeHtml(stop.address) + '<br><span>' + stopLabels[stop.status] + '</span>';
        place('stop-' + stop.id, stop, stop.status, number, popup, stop.status === 'next' ? 1100 : 200);
      });

      var points = [];
      if (data.me) points.push([data.me.lat, data.me.lng]);
      var next = (data.stops || []).find(function (stop) { return stop.status === 'next'; });
      if (next) points.push([next.lat, next.lng]);
      if (points.length === 0 && data.school) points.push([data.school.lat, data.school.lng]);
      if (points.length === 1) map.setView(points[0], 15);
      else if (points.length > 1) map.fitBounds(points, { padding: [40,40], maxZoom: 16 });
    } catch (error) {
      notify('error');
    }
  };
  notify('ready');
  }
</script>
</body></html>`;
}

export function TripMap({ me, school, stops, height = 200 }: TripMapProps) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const provider = resolveMapTileProvider(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);
  const html = useMemo(() => buildTripMapHtml(provider), [provider.kind, provider.tileUrl]);
  const payload = JSON.stringify({ me, school, stops });

  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.rsUpdate && window.rsUpdate(${payload}); true;`);
  }, [ready, payload]);

  function onMessage(event: WebViewMessageEvent) {
    if (event.nativeEvent.data === 'ready') {
      setFailed(false);
      setReady(true);
    }
    if (event.nativeEvent.data === 'error') setFailed(true);
  }

  function retry() {
    setReady(false);
    setFailed(false);
    setAttempt((value) => value + 1);
  }

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.bg }}>
      {failed ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
            Mapa no disponible. Comprueba tu conexión.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar el mapa"
            onPress={retry}
            style={({ pressed }) => ({
              borderRadius: radius.pill,
              backgroundColor: colors.navy,
              paddingHorizontal: 16,
              paddingVertical: 9,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={attempt}
          ref={ref}
          originWhitelist={['about:blank']}
          source={{ html }}
          onMessage={onMessage}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url.startsWith('about:')) return true;
            if (isAllowedMapAttributionUrl(request.url)) void Linking.openURL(request.url);
            return false;
          }}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          mixedContentMode="never"
          applicationNameForUserAgent="RutaSegura/0.1"
          scrollEnabled={false}
          startInLoadingState
          renderLoading={() => (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cargando mapa…</Text>
            </View>
          )}
          style={{ backgroundColor: colors.bg }}
        />
      )}
    </View>
  );
}
