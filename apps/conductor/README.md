# App del conductor

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
