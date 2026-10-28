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

// Mapa del recorrido para el conductor. En vez de una dependencia nativa de
// mapas (react-native-maps + llaves de Google/Apple), reutilizamos el mismo
// enfoque que la web del apoderado: Leaflet dentro de un WebView, con Mapbox
// Streets cuando hay un token público. OpenStreetMap queda como respaldo sin
// token o ante un fallo de tiles. Muestra el furgón y el destino operativo.
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

const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';
const MAPBOX_ATTRIBUTION =
  '<a href="https://www.mapbox.com/about/maps/">© Mapbox</a> ' +
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> ' +
  '<a id="improve-map" href="https://apps.mapbox.com/feedback/">Improve this map</a>';

function buildHtml(provider: MapTileProvider): string {
  const providerJson = JSON.stringify(provider);
  const fallbackProviderJson = JSON.stringify(fallbackMapTileProvider(provider));
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
  .rs-pin { display: grid; place-items: center; border-radius: 999px; border: 3px solid #fff;
            box-shadow: 0 4px 12px rgba(27,42,91,.35); font-size: 17px; }
  .rs-me { background: ${colors.navy}; }
  .rs-home { background: ${colors.yellow}; }
  .rs-school { background: ${colors.navy}; }
  #provider-logo { position: absolute; z-index: 800; left: 8px; bottom: 5px; }
  #provider-logo[hidden] { display: none; }
  #provider-attribution { position: absolute; z-index: 800; right: 0; bottom: 0; padding: 2px 5px;
    background: rgba(255,255,255,.82); color: #22304f; font: 9px/1.2 -apple-system, sans-serif; }
  #provider-attribution a { color: #22304f; text-decoration: none; }
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
        var nextProvider = fallbackProvider;
        fallbackProvider = null;
        useProvider(nextProvider);
        notify('fallback');
      } else {
        notify('error');
      }
    });
    tileLayer.addTo(map);
  }

  useProvider(provider);
  map.setView([-33.45, -70.66], 12); // Santiago por defecto, hasta tener GPS

  map.on('moveend', function () {
    if (activeProvider.kind !== 'mapbox') return;
    var center = map.getCenter();
    var feedback = document.getElementById('improve-map');
    if (feedback) feedback.href = 'https://apps.mapbox.com/feedback/#/' + center.lng + '/' + center.lat + '/' + map.getZoom();
  });

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
  const provider = resolveMapTileProvider(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);
  const html = useMemo(() => buildHtml(provider), [provider.kind, provider.tileUrl]);

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
