import { tripClock } from '../../../../shared/trip-clock';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { fetchTodayRoute, startTrip, type TodayRoute } from '@/lib/tripApi';
import { startSharingLocation } from '@/lib/backgroundLocation';
import { colors, typography } from '@/lib/theme';
import { Avatar, Button, Card, ErrorText, Loading, Screen, Segment } from '@/components/ui';
import { DriverHeader } from '@/components/driver-shell';

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
        <DriverHeader />
        <Text style={typography.h2}>No pudimos cargar la ruta</Text>
        <Text style={typography.muted}>{loadError}</Text>
        <Button title="Reintentar" onPress={load} />
      </Screen>
    );
  }

  if (!route) {
    return (
      <Screen style={{ paddingTop: 64 }}>
        <DriverHeader />
        <Text style={typography.muted}>
          No tienes una ruta de {kind === 'AM' ? 'ida' : 'vuelta'} configurada todavía. Pide al equipo que te la cree.
        </Text>
      </Screen>
    );
  }

  const isToSchool = route.direction === 'to_school';
  const routeDirectionLabel = isToSchool ? 'Casa → Colegio' : 'Colegio → Casa';

  return (
    <Screen style={{ gap: 0 }}>
      <DriverHeader />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 16, paddingTop: 16, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
      <View>
        <Text style={[typography.display, { fontSize: 30 }]}>Mis rutas</Text>
        <Text style={typography.small}>{route.vehicleNickname}</Text>
      </View>

      <Segment
        value={kind}
        onChange={setKind}
        options={[
          { value: 'AM', label: 'Ida', detail: 'Casa → Colegio' },
          { value: 'PM', label: 'Vuelta', detail: 'Colegio → Casa' },
        ]}
      />

      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flexShrink: 1, paddingRight: 10 }}>
            <Text style={typography.title}>{route.name}</Text>
            <Text style={[typography.small, { fontWeight: '700' }]}>{routeDirectionLabel}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.chipBg, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: colors.navy, fontSize: 14 }}>◷</Text>
            <Text style={{ color: colors.navy, fontWeight: '800', fontSize: 13 }}>{route.departureTime.slice(0, 5)}</Text>
          </View>
        </View>
        <View>
            {route.stops.map((item, index) => (
              <View key={item.studentId}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                  <Avatar name={item.fullName} size={48} />
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{item.fullName}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 24 }}>›</Text>
                </View>
                {index < route.stops.length - 1 ? <View style={{ height: 1, backgroundColor: colors.cardBorder }} /> : null}
              </View>
            ))}
        </View>
        <Button
          title={isToSchool ? '▶  Iniciar ida' : '▶  Iniciar vuelta'}
          variant="success"
          onPress={handleStart}
          loading={starting}
          disabled={route.stops.length === 0}
        />
      </Card>

      {permissionError && <ErrorText>{permissionError}</ErrorText>}

      <HomeLink icon="♙" label="Mis alumnos" onPress={() => router.push('/(driver)/alumnos')} />
      <HomeLink icon="♙+" label="Invitar apoderados" onPress={() => router.push('/(driver)/compartir')} />
      </ScrollView>
    </Screen>
  );
}

function HomeLink({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 76,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.chipBg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.navy, fontWeight: '900', fontSize: 17 }}>{icon}</Text>
      </View>
      <Text style={{ flex: 1, color: colors.navy, fontWeight: '800', fontSize: 17 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 26 }}>›</Text>
    </Pressable>
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
