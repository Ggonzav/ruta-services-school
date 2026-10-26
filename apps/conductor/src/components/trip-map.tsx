import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, radius } from '@/lib/theme';

// Mapa del recorrido para el conductor. En vez de una dependencia nativa de
// mapas (react-native-maps + llaves de Google/Apple), reutilizamos el mismo
// enfoque que la web del apoderado: Leaflet dentro de un WebView, con tiles
// CARTO gratis (sin token). Muestra el furgón (posición del conductor), la
// parada destino (casa del alumno elegido) y el colegio.
//
// El HTML se carga una sola vez; cada cambio de coordenadas se empuja con
// `injectJavaScript` llamando a window.rsUpdate(...), así el mapa no se
// recarga en cada tick de GPS.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TripMapProps {
  /** Posición actual del conductor (furgón). null mientras no hay GPS. */
  me: LatLng | null;
  /** Parada destino actual (casa del alumno elegido). null si no hay destino. */
  target: (LatLng & { label?: string }) | null;
  /** Colegio de la ruta. */
  school: LatLng | null;
  /** Otras paradas pendientes (puntos tenues de referencia). */
  others?: LatLng[];
  height?: number;
}

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

function buildHtml(): string {
  return `<!doctype html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin: 0; height: 100%; width: 100%; background: ${colors.bg}; }
  .rs-pin { display: grid; place-items: center; border-radius: 999px; border: 3px solid #fff;
            box-shadow: 0 4px 12px rgba(27,42,91,.35); font-size: 17px; }
  .rs-me { background: ${colors.navy}; }
  .rs-home { background: ${colors.yellow}; }
  .rs-school { background: ${colors.navy}; }
</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: false });
  L.tileLayer('${TILE_URL}', { maxZoom: 19 }).addTo(map);
  L.control.attribution({ prefix: false }).addTo(map).addAttribution('© OpenStreetMap © CARTO');
  map.setView([-33.45, -70.66], 12); // Santiago por defecto, hasta tener GPS

  var markers = {};
  function icon(cls, emoji) {
    return L.divIcon({ className: '', html: '<div class="rs-pin ' + cls + '" style="width:34px;height:34px">' + emoji + '</div>', iconSize: [34,34], iconAnchor: [17,17] });
  }
  function place(key, p, cls, emoji, popup) {
    if (!p) { if (markers[key]) { map.removeLayer(markers[key]); delete markers[key]; } return; }
    var ll = [p.lat, p.lng];
    if (markers[key]) { markers[key].setLatLng(ll); }
    else { markers[key] = L.marker(ll, { icon: icon(cls, emoji) }).addTo(map); }
    if (popup) markers[key].bindPopup(popup);
  }

  window.rsUpdate = function (data) {
    try {
      place('me', data.me, 'rs-me', '\\uD83D\\uDE8C');       // furgón
      place('target', data.target, 'rs-home', '\\uD83C\\uDFE0'); // casa
      place('school', data.school, 'rs-school', '\\uD83C\\uDFEB'); // colegio
      // puntos tenues de otras paradas
      (markers.others || []).forEach(function (m) { map.removeLayer(m); });
      markers.others = [];
      (data.others || []).forEach(function (p) {
        var m = L.circleMarker([p.lat, p.lng], { radius: 5, color: '${colors.textMuted}', weight: 2, fillOpacity: 0.5 }).addTo(map);
        markers.others.push(m);
      });
      var pts = [];
      ['me','target','school'].forEach(function (k) { if (data[k]) pts.push([data[k].lat, data[k].lng]); });
      if (pts.length === 1) { map.setView(pts[0], 15); }
      else if (pts.length > 1) { map.fitBounds(pts, { padding: [40,40], maxZoom: 16 }); }
    } catch (e) { /* no-op */ }
  };
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
</script>
</body></html>`;
}

export function TripMap({ me, target, school, others = [], height = 200 }: TripMapProps) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const payload = JSON.stringify({ me, target, school, others });
  // Empuja las coordenadas al mapa cuando ya cargó o cuando cambian.
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.rsUpdate && window.rsUpdate(${payload}); true;`);
  }, [ready, payload]);

  function onMessage(e: WebViewMessageEvent) {
    if (e.nativeEvent.data === 'ready') setReady(true);
  }

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.bg }}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: buildHtml() }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        startInLoadingState
        renderLoading={() => (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cargando mapa…</Text>
          </View>
        )}
        style={{ backgroundColor: colors.bg }}
      />
    </View>
  );
}
