# App del conductor

## Identidad visual

La fuente de la marca está en `assets/brand-mark.svg`: pin amarillo con
furgón navy, sin texto. `assets/icon.png` es el ícono opaco de 1024×1024;
`adaptive-icon.png` conserva transparencia para Android. Expo resuelve además
el splash y favicon desde `app.json`. El AppIcon de iOS se mantiene sincronizado
en `ios/FurgnConductor/Images.xcassets` porque este proyecto conserva el árbol
nativo de iOS.

Los marcadores del recorrido son SVG inline locales dentro de Leaflet. No
cargan imágenes externas: naranja identifica la próxima parada, azul las
pendientes, verde las completadas, gris las omitidas y morado el colegio.
El número mostrado es el `seq` original de `route_stops`.

## Mapa

El mapa usa Leaflet dentro de `react-native-webview`. Para usar Mapbox Streets,
crea `apps/conductor/.env.local` a partir de `.env.example` y configura un token
público restringido:

```bash
EXPO_PUBLIC_MAPBOX_TOKEN=pk...
```

Expo incorpora las variables `EXPO_PUBLIC_*` al bundle; por eso este valor es
visible para quien instala la app. Nunca usar el secreto `MAPBOX_ACCESS_TOKEN`
del backend ni un token `sk.*`. Tras cambiar el token, hacer una recarga completa
del dev build.

Sin token público válido, o si Mapbox falla durante la carga, el mapa utiliza
temporalmente los tiles estándar de OpenStreetMap. No descarga mapas para uso
offline ni hace precarga de tiles.
