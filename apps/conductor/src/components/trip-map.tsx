import { useEffect, useRef, useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, radius } from '@/lib/theme';

// Mapa del recorrido para el conductor. En vez de una dependencia nativa de
// mapas (react-native-maps + llaves de Google/Apple), reutilizamos el mismo
// enfoque que la web del apoderado: Leaflet dentro de un WebView, con tiles
// estándar de OpenStreetMap (sin token). Muestra el furgón (posición del conductor), la
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

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function buildHtml(): string {
  return `<!doctype html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: https://tile.openstreetmap.org" />
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
  function notify(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
  }

  if (!window.L) {
    notify('error');
  } else {
  var map = L.map('map', { zoomControl: false, attributionControl: false });
  var tileErrors = 0;
  L.tileLayer('${TILE_URL}', { maxZoom: 19 })
    .on('tileerror', function () {
      tileErrors += 1;
      if (tileErrors === 3) notify('error');
    })
    .addTo(map);
  L.control.attribution({ prefix: false }).addTo(map).addAttribution('© OpenStreetMap');
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
      ['me','target'].forEach(function (k) { if (data[k]) pts.push([data[k].lat, data[k].lng]); });
      if (pts.length === 0 && data.school) pts.push([data.school.lat, data.school.lng]);
      if (pts.length === 1) { map.setView(pts[0], 15); }
      else if (pts.length > 1) { map.fitBounds(pts, { padding: [40,40], maxZoom: 16 }); }
    } catch (e) { notify('error'); }
  };
  notify('ready');
  }
</script>
</body></html>`;
}

export function TripMap({ me, target, school, others = [], height = 200 }: TripMapProps) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const payload = JSON.stringify({ me, target, school, others });
  // Empuja las coordenadas al mapa cuando ya cargó o cuando cambian.
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.rsUpdate && window.rsUpdate(${payload}); true;`);
  }, [ready, payload]);

  function onMessage(e: WebViewMessageEvent) {
    if (e.nativeEvent.data === 'ready') {
      setFailed(false);
      setReady(true);
    }
    if (e.nativeEvent.data === 'error') setFailed(true);
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
          source={{ html: buildHtml() }}
          onMessage={onMessage}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          mixedContentMode="never"
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
