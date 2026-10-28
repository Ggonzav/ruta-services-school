export type MapTileProvider = {
  kind: 'mapbox' | 'osm';
  tileUrl: string;
};

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * El token del cliente es público por definición. Aun así, sólo aceptamos
 * tokens publicables de Mapbox (pk.*); un token secreto sk.* nunca debe
 * terminar en el bundle de Expo.
 */
export function resolveMapTileProvider(rawToken?: string): MapTileProvider {
  const token = rawToken?.trim() ?? '';
  if (!token.startsWith('pk.')) return { kind: 'osm', tileUrl: OSM_TILE_URL };

  return {
    kind: 'mapbox',
    tileUrl: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(token)}`,
  };
}

export function fallbackMapTileProvider(activeProvider: MapTileProvider): MapTileProvider | null {
  return activeProvider.kind === 'mapbox' ? { kind: 'osm', tileUrl: OSM_TILE_URL } : null;
}

export function isAllowedMapAttributionUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    return (
      (url.hostname === 'www.mapbox.com' && (url.pathname === '/' || url.pathname.startsWith('/about/maps'))) ||
      (url.hostname === 'apps.mapbox.com' && url.pathname.startsWith('/feedback')) ||
      (url.hostname === 'www.openstreetmap.org' && url.pathname.startsWith('/copyright'))
    );
  } catch {
    return false;
  }
}
