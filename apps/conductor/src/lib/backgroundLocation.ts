// ============================================================================
// GPS en segundo plano mientras el recorrido está en curso.
//
// Esto es justo lo que el "arquitecto" marcó como el riesgo técnico real
// del proyecto (ver docs/ARQUITECTURA.md § Spike de GPS): en iOS requiere
// permiso "Always" y un development build (no funciona en Expo Go); en
// Android, un foreground service con notificación persistente. Ninguno de
// los dos se puede probar sin un build real en un teléfono — por eso este
// archivo prueba la persistencia y recuperación con mocks; el seguimiento
// físico sigue requiriendo una prueba en dispositivo.
//
// Lo que NUNCA hace este archivo: guardar la posición en Supabase. Sólo la
// reenvía a la Edge Function update-eta, que la usa una vez y la descarta.
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { shouldSendPosition } from './tripLogic';
import { supabase } from './supabase';

export const LOCATION_TASK_NAME = 'furgon-update-eta';

const ACTIVE_TRIP_KEY = 'furgon:active-trip';
let lastSentAtMs: number | null = null;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[backgroundLocation] error de la tarea', error);
    return;
  }
  const activeTripId = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
  if (!activeTripId) return;

  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const last = locations?.at(-1);
  if (!last) return;

  const now = Date.now();
  if (!shouldSendPosition(lastSentAtMs, now)) return;
  lastSentAtMs = now;

  await sendPositionToEta(
    activeTripId,
    last.coords.latitude,
    last.coords.longitude,
    last.coords.heading,
    last.coords.speed
  );
});

async function sendPositionToEta(
  tripId: string,
  lat: number,
  lng: number,
  heading?: number | null,
  speed?: number | null
) {
  try {
    // supabase.functions.invoke ya adjunta el Authorization: Bearer de la
    // sesión guardada (AsyncStorage) — no hace falta leerla a mano.
    const { error } = await supabase.functions.invoke('update-eta', {
      body: { trip_id: tripId, lat, lng, heading, speed },
    });
    if (error) throw error;
  } catch (err) {
    // El próximo tick (30–45s después) reintenta solo: no hace falta
    // lógica de reintento acá, sólo no crashear la tarea en background.
    console.warn('[backgroundLocation] no se pudo mandar la posición', err);
  }
}

/** Llamar al presionar "Iniciar recorrido". Pide permisos si hace falta. */
export async function startSharingLocation(tripId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'foreground_permission_denied' };

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return { ok: false, reason: 'background_permission_denied' };

  await AsyncStorage.setItem(ACTIVE_TRIP_KEY, tripId);
  lastSentAtMs = null;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 30,
    // Android: notificación fija mientras comparte ubicación. Es
    // obligatoria para un foreground service y además es honesta: el
    // apoderado sabe (por la app) que se comparte, y el conductor ve en
    // su propia barra que se sigue compartiendo.
    foregroundService: {
      notificationTitle: 'Compartiendo tu ubicación',
      notificationBody: 'Los apoderados de esta ruta pueden ver cuánto falta para llegar.',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });

  return { ok: true };
}

/** Llamar al presionar "Finalizar recorrido". */
export async function stopSharingLocation(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
  lastSentAtMs = null;
  const isRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
