import { describe, expect, it } from 'vitest';
import { fallbackMapTileProvider, isAllowedMapAttributionUrl, resolveMapTileProvider } from './mapConfig';

describe('configuración del mapa del conductor', () => {
  it('usa Mapbox Streets únicamente con un token público', () => {
    const provider = resolveMapTileProvider(' pk.public/value ');

    expect(provider.kind).toBe('mapbox');
    expect(provider.tileUrl).toContain('/mapbox/streets-v12/tiles/256/');
    expect(provider.tileUrl).toContain('access_token=pk.public%2Fvalue');
    expect(provider.tileUrl).not.toContain('/directions/');
  });

  it.each([undefined, '', 'sk.secret', 'token-invalido'])(
    'usa OpenStreetMap como respaldo cuando el token no es publicable: %s',
    (token) => {
      expect(resolveMapTileProvider(token)).toEqual({
        kind: 'osm',
        tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      });
    }
  );

  it('cambia de Mapbox a OSM ante un fallo y no encadena otro proveedor', () => {
    const mapbox = resolveMapTileProvider('pk.public');
    const fallback = fallbackMapTileProvider(mapbox);

    expect(fallback).toEqual({ kind: 'osm', tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' });
    expect(fallbackMapTileProvider(fallback!)).toBeNull();
  });

  it('sólo permite abrir enlaces de atribución conocidos por HTTPS', () => {
    expect(isAllowedMapAttributionUrl('https://www.mapbox.com/about/maps/')).toBe(true);
    expect(isAllowedMapAttributionUrl('https://apps.mapbox.com/feedback/#/-70/-33/14')).toBe(true);
    expect(isAllowedMapAttributionUrl('https://www.openstreetmap.org/copyright')).toBe(true);
    expect(isAllowedMapAttributionUrl('http://www.mapbox.com/about/maps/')).toBe(false);
    expect(isAllowedMapAttributionUrl('https://example.com/')).toBe(false);
    expect(isAllowedMapAttributionUrl('not-a-url')).toBe(false);
  });
});
