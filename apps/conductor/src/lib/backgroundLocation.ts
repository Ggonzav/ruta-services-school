// iOS requiere permiso Siempre y un build nativo. Los eventos en segundo
// plano dependen del sistema; no se promete una cadencia fija con JS suspendido.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export const LOCATION_TASK_NAME = 'furgon-update-eta';
const ACTIVE_TRIP_KEY = 'furgon:active-trip';
const RETRY_MS = 15_000;
const SEND_MS = 30_000;
const FRESH_MS = 120_000;
let generation = 0;
let busy = false;
let nextAttemptAt = 0;
let status = { tripId: '', confirmedAt: 0, failed: false, enabled: false };

export function locationStatus(tripId: string, now = Date.now()) {
  if (status.tripId !== tripId || !status.enabled) return { confirmed: false, label: 'GPS sin activar' };
  if (status.failed) return { confirmed: false, label: 'GPS sin confirmar · reintentando' };
  if (status.confirmedAt && now - status.confirmedAt < FRESH_MS) {
    return { confirmed: true, label: 'Ubicación recibida' };
  }
  return { confirmed: false, label: status.confirmedAt ? 'Ubicación sin actualizar' : 'Esperando recepción GPS' };
}

async function bounded<T>(promise: Promise<T>, onTimeout = () => {}): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { onTimeout(); reject(new Error('location_timeout')); }, 15_000);
    })]);
  } finally {
    clearTimeout(timer!);
  }
}

// Una sola captura/envío a la vez. No se guarda historial ni se reenvían
// coordenadas antiguas al recuperar la red. La Edge persiste la última posición.
async function attempt(tripId: string, point?: Location.LocationObject) {
  if (busy || Date.now() < nextAttemptAt) return;
  busy = true;
  const version = generation;
  try {
    if (await AsyncStorage.getItem(ACTIVE_TRIP_KEY) !== tripId || version !== generation) return;
    if (status.tripId !== tripId) status = { tripId, enabled: true, confirmedAt: 0, failed: false };
    const location = point ?? await bounded(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    if (version !== generation) return;
    // Eventos agrupados por el SO pueden contener una posición ya vencida.
    if (!Number.isFinite(location.timestamp) || Date.now() - location.timestamp >= FRESH_MS) {
      throw new Error('stale_location');
    }
    const { latitude: lat, longitude: lng, heading, speed } = location.coords;
    const controller = new AbortController();
    const { data, error } = await bounded(supabase.functions.invoke('update-eta', {
      body: { trip_id: tripId, lat, lng, heading, speed },
      signal: controller.signal,
    }), () => controller.abort());
    if (error || data?.ok !== true) throw new Error('location_not_acknowledged');
    if (version !== generation) return;
    status = { tripId, enabled: true, confirmedAt: Math.min(Date.now(), location.timestamp), failed: false };
    nextAttemptAt = Date.now() + SEND_MS;
  } catch {
    if (version !== generation) return;
    status = { ...status, tripId, failed: true };
    nextAttemptAt = Date.now() + RETRY_MS;
  } finally {
    busy = false;
  }
}

/** Respaldo en primer plano: captura fresca aunque el vehículo esté detenido. */
export async function refreshLocation(tripId: string): Promise<void> {
  await attempt(tripId);
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  try {
    const tripId = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
    if (!tripId) return;
    if (error) {
      status = { ...status, tripId, enabled: true, failed: true };
      return;
    }
    const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
    const last = locations?.at(-1);
    if (last) await attempt(tripId, last);
  } catch {
    // La tarea no debe provocar un rechazo sin manejar si falla el almacenamiento.
    status = { ...status, failed: true };
  }
});

/** ok indica seguimiento registrado; sólo locationStatus confirma recepción. */
export async function startSharingLocation(tripId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const version = ++generation;
  status = { tripId, confirmedAt: 0, failed: false, enabled: false };
  nextAttemptAt = 0;
  await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
  const fg = await Location.requestForegroundPermissionsAsync();
  if (version !== generation) return { ok: false, reason: 'cancelled' };
  if (fg.status !== 'granted') return { ok: false, reason: 'foreground_permission_denied' };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (version !== generation) return { ok: false, reason: 'cancelled' };
  if (bg.status !== 'granted') return { ok: false, reason: 'background_permission_denied' };
  await AsyncStorage.setItem(ACTIVE_TRIP_KEY, tripId);
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15_000,
      distanceInterval: 30,
      foregroundService: {
        notificationTitle: 'Compartiendo tu ubicación',
        notificationBody: 'Los apoderados de esta ruta pueden ver cuánto falta para llegar.',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    if (version !== generation) {
      if (!await AsyncStorage.getItem(ACTIVE_TRIP_KEY)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
      return { ok: false, reason: 'cancelled' };
    }
    status.enabled = true;
    void refreshLocation(tripId);
    return { ok: true };
  } catch (error) {
    if (version === generation) {
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      status.enabled = false;
    }
    throw error;
  }
}

export async function stopSharingLocation(): Promise<void> {
  generation++;
  status = { tripId: '', confirmedAt: 0, failed: false, enabled: false };
  nextAttemptAt = 0;
  await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
  if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
