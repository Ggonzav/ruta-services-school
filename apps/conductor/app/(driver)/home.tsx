import { tripClock } from '../../../../shared/trip-clock';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { fetchTodayRoute, startTrip, type TodayRoute } from '@/lib/tripApi';
import { startSharingLocation } from '@/lib/backgroundLocation';
import { colors, typography } from '@/lib/theme';
import { Badge, Button, Card, ErrorText, Eyebrow, Loading, Screen, Segment, Spacer } from '@/components/ui';

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

  if (loading) return <Loading />;

  if (loadError) {
    return (
      <Screen style={{ paddingTop: 64, gap: 16 }}>
        <Text style={typography.h2}>No pudimos cargar la ruta</Text>
        <Text style={typography.muted}>{loadError}</Text>
        <Button title="Reintentar" onPress={load} />
      </Screen>
    );
  }

  if (!route) {
    return (
      <Screen style={{ paddingTop: 64 }}>
        <Text style={typography.muted}>
          No tienes una ruta {kind} configurada todavía. Pide al equipo que te la cree.
        </Text>
      </Screen>
    );
  }

  const isToSchool = route.direction === 'to_school';
  const routeDirectionLabel = isToSchool ? 'Casa → Colegio' : 'Colegio → Casa';

  return (
    <Screen>
      <View>
        <Eyebrow>🚌 RUTASEGURA</Eyebrow>
        <Text style={typography.display}>Mis rutas</Text>
        <Text style={typography.small}>{route.vehicleNickname}</Text>
      </View>

      <Segment
        value={kind}
        onChange={setKind}
        options={[
          { value: 'AM', label: 'Mañana' },
          { value: 'PM', label: 'Tarde' },
        ]}
      />

      <Card style={{ flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ flexShrink: 1, paddingRight: 10 }}>
            <Text style={typography.title}>{route.name}</Text>
            <Text style={{ fontSize: 12.5, color: colors.blue, fontWeight: '800', marginTop: 1 }}>{routeDirectionLabel}</Text>
            <Text style={typography.small}>
              {route.stops.length} alumnos · {route.stops.length} paradas
            </Text>
          </View>
          <Badge label="Lista" />
        </View>
        <Text style={[typography.small, { marginBottom: 8 }]}>Horario {route.departureTime}</Text>
        <ScrollView style={{ maxHeight: 220 }}>
          <View style={{ gap: 9 }}>
            {route.stops.map((item, index) => (
              <View key={item.studentId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: colors.blue,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.white, fontSize: 13, fontWeight: '800' }}>{index + 1}</Text>
                </View>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{item.fullName}</Text>
                  <Text style={typography.small}>{item.address}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>

      {permissionError && <ErrorText>{permissionError}</ErrorText>}

      <Spacer />

      <Text style={[typography.small, { textAlign: 'center' }]}>
        Tu ubicación se comparte solo con los apoderados de esta ruta, y solo mientras el recorrido esté activo.
      </Text>

      <Button
        title={isToSchool ? 'Iniciar ida' : 'Iniciar vuelta'}
        variant="success"
        onPress={handleStart}
        loading={starting}
        disabled={route.stops.length === 0}
      />
      <Button
        title="Invitar apoderados"
        variant="ghost"
        size="md"
        onPress={() => router.push('/(driver)/compartir')}
        style={{ marginBottom: 12 }}
      />
    </Screen>
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
