import { tripClock } from '../../../../shared/trip-clock';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { fetchTodayRoute, startTrip, type TodayRoute } from '@/lib/tripApi';
import { startSharingLocation } from '@/lib/backgroundLocation';
import { colors } from '@/lib/theme';

// Pantalla 1 del prototipo visual: "Iniciar recorrido". AM/PM se elige acá
// (por defecto AM antes de las 13:00, PM después) — el MVP no soporta más
// de una ruta por turno por transportista.
export default function HomeScreen() {
  const [kind, setKind] = useState<'AM' | 'PM'>(tripClock().kind);
  const [route, setRoute] = useState<TodayRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetchTodayRoute(kind);
      setRoute(r);

      // Si ya estaba en curso (la app se cerró y se reabrió a mitad de
      // camino), reactivamos el GPS antes de volver al recorrido.
      if (r?.tripId && r.tripStatus === 'in_progress') {
        try {
          const shared = await startSharingLocation(r.tripId);
          if (!shared.ok) {
            setPermissionError('Activa los permisos de ubicación para retomar el recorrido.');
            return;
          }
          router.replace({ pathname: '/(driver)/trip', params: { tripId: r.tripId } });
        } catch {
          setPermissionError('No se pudo reactivar la ubicación. Intenta retomar el recorrido.');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      setRoute(null);
      setLoadError(`No pudimos cargar tu ruta: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleStart() {
    if (!route) return;
    setStarting(true);
    setPermissionError(null);
    try {
      const { tripId } = await startTrip(route.routeId);
      router.replace({ pathname: '/(driver)/trip', params: { tripId } });
      startSharingLocation(tripId)
        .then((shared) => {
          if (!shared.ok) {
            const message =
              shared.reason === 'background_permission_denied'
                ? 'Para compartir tu ubicación mientras usas otras apps, activa el permiso de ubicación "Siempre" en Ajustes.'
                : 'Necesitamos el permiso de ubicación para calcular avisos de llegada.';
            setPermissionError(message);
            Alert.alert('GPS no activado', message);
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Error desconocido';
          setPermissionError(`El recorrido inició, pero no pudimos activar GPS: ${message}`);
          Alert.alert('GPS no activado', `El recorrido inició, pero no pudimos activar GPS: ${message}`);
        });
    } catch (error) {
      const message = errorMessage(error);
      const visibleMessage = message.includes('driver_start_trip')
        ? 'Falta subir la migración 0007 a Supabase. Ejecuta npx supabase db push.'
        : message.includes('trip_already_finished')
          ? 'Este recorrido ya fue finalizado hoy. Resetea la demo o prueba otra ruta.'
          : `No pudimos iniciar el recorrido: ${message}`;
      setPermissionError(visibleMessage);
      Alert.alert('No se pudo iniciar', visibleMessage);
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 64, gap: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>No pudimos cargar la ruta</Text>
        <Text style={{ fontSize: 16, color: colors.textMuted }}>{loadError}</Text>
        <Pressable
          onPress={load}
          style={{
            height: 52,
            borderRadius: 14,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '700' }}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (!route) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 64 }}>
        <Text style={{ fontSize: 17, color: colors.textMuted }}>
          No tienes una ruta {kind} configurada todavía. Pide al equipo que te la cree.
        </Text>
      </View>
    );
  }

  const isToSchool = route.direction === 'to_school';
  const routeDirectionLabel = isToSchool ? 'Casa → Colegio' : 'Colegio → Casa';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 56, paddingHorizontal: 20, gap: 18 }}>
      <View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textMuted }}>
          🚌 RutaSegura
        </Text>
        <Text style={{ fontSize: 34, fontWeight: '800', color: colors.text }}>Mis rutas</Text>
        <Text style={{ fontSize: 15, color: colors.textMuted }}>{route.vehicleNickname}</Text>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: colors.chipBg, borderRadius: 14, padding: 4 }}>
        {(['AM', 'PM'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            style={{
              flexGrow: 1,
              height: 44,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: kind === k ? '#2684FF' : 'transparent',
            }}
          >
            <Text style={{ color: kind === k ? '#FFFFFF' : colors.text, fontWeight: '600' }}>
              {k === 'AM' ? 'Mañana' : 'Tarde'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          borderRadius: 18,
          padding: 18,
          flexShrink: 1,
          shadowColor: '#0B2A55',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{route.name}</Text>
            <Text style={{ fontSize: 14, color: '#2684FF', fontWeight: '800' }}>{routeDirectionLabel}</Text>
            <Text style={{ fontSize: 15, color: colors.textMuted }}>
              {route.stops.length} alumnos · {route.stops.length} paradas
            </Text>
          </View>
          <View style={{ backgroundColor: colors.successBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, color: colors.success, fontWeight: '800' }}>Lista</Text>
          </View>
        </View>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 8 }}>Horario {route.departureTime}</Text>
        <FlatList
          data={route.stops}
          keyExtractor={(s) => s.studentId}
          renderItem={({ item, index }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: '#2684FF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>{index + 1}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.fullName}</Text>
                <Text style={{ fontSize: 14, color: colors.textMuted }}>{item.address}</Text>
              </View>
            </View>
          )}
        />
      </View>

      {permissionError && <Text style={{ color: colors.danger, fontSize: 14 }}>{permissionError}</Text>}

      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
        Tu ubicación se comparte solo con los apoderados de esta ruta, y solo mientras el recorrido esté
        activo.
      </Text>

      <Pressable
        onPress={handleStart}
        disabled={starting || route.stops.length === 0}
        style={{
          height: 64,
          borderRadius: 18,
          backgroundColor: colors.success,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: starting ? 0.6 : 1,
          marginBottom: 12,
        }}
      >
        {starting ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>
            {isToSchool ? 'Iniciar ida' : 'Iniciar vuelta'}
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => router.push('/(driver)/compartir')}
        style={{
          height: 52,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '800' }}>Invitar apoderados</Text>
      </Pressable>
    </View>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const maybe = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [maybe.message, maybe.details, maybe.code]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (parts.length > 0) return parts.join(' · ');
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
