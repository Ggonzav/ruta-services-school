import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { finishTrip, markStop } from '@/lib/tripApi';
import { stopSharingLocation } from '@/lib/backgroundLocation';
import { nextPendingStop, tripProgress, upcomingStops, type Stop } from '@/lib/tripLogic';
import { colors } from '@/lib/theme';
import { directionForKind, type RouteDirection, type RouteKind } from '../../../../shared/rutasegura-api';

// Pantalla 2 del prototipo visual: una parada a la vez, dos botones
// grandes. Deliberadamente NO hay mapa ni lista larga que requiera scroll
// mientras el conductor maneja.
export default function TripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [stops, setStops] = useState<Stop[]>([]);
  const [settled, setSettled] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<RouteDirection>('to_school');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const { data: trip } = await supabase.from('trips').select('route_id, routes(kind)').eq('id', tripId).single();
    if (!trip) return;
    const routeKind = ((trip as any).routes?.kind ?? 'AM') as RouteKind;
    setDirection(directionForKind(routeKind));

    const { data: stopsRows } = await supabase
      .from('route_stops')
      .select('student_id, seq, address, students(full_name)')
      .eq('route_id', trip.route_id)
      .order('seq', { ascending: true });

    const { data: events } = await supabase
      .from('trip_events')
      .select('student_id, kind')
      .eq('trip_id', tripId)
      .in('kind', ['picked_up', 'skipped', 'dropped_off']);

    setStops(
      (stopsRows ?? []).map((r: any) => ({
        studentId: r.student_id,
        seq: r.seq,
        address: r.address,
        fullName: r.students?.full_name ?? '(sin nombre)',
      }))
    );
    setSettled(new Set((events ?? []).map((e) => e.student_id as string)));
    setLoading(false);
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const current = nextPendingStop(stops, settled);
  const progress = tripProgress(stops, settled);
  const upcoming = current ? upcomingStops(stops, settled, current.studentId) : [];

  async function act(action: 'completed' | 'absent') {
    if (!current) return;
    setActing(true);
    try {
      await markStop(tripId, current.studentId, action);
      setSettled((prev) => new Set(prev).add(current.studentId));
    } catch (err) {
      Alert.alert('No se pudo registrar', 'Intenta de nuevo.');
    } finally {
      setActing(false);
    }
  }

  const isToSchool = direction === 'to_school';

  async function handleFinish() {
    Alert.alert('Finalizar recorrido', '¿Seguro que quieres finalizar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        style: 'destructive',
        onPress: async () => {
          try {
            await finishTrip(tripId);
            await stopSharingLocation();
            router.replace({ pathname: '/(driver)/summary', params: { tripId } });
          } catch {
            Alert.alert('No se pudo finalizar', 'Comprueba tu conexión e intenta de nuevo.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 56, paddingHorizontal: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.accent,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success }} />
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>En recorrido</Text>
        </View>
        <Text style={{ color: colors.success, fontWeight: '800' }}>
          GPS activo
        </Text>
      </View>

      {current ? (
        <View
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
          borderRadius: 22,
          padding: 20,
          gap: 12,
          shadowColor: '#0B2A55',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2684FF', textTransform: 'uppercase' }}>
            Próxima parada · {Math.min(progress.done + 1, progress.total)} de {progress.total}
          </Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.text }}>{current.fullName}</Text>
          <Text style={{ fontSize: 16, color: colors.textMuted }}>{current.address}</Text>

          <Pressable
            onPress={() => act('completed')}
            disabled={acting}
            style={{
              height: 72,
              borderRadius: 18,
              backgroundColor: colors.success,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: acting ? 0.6 : 1,
              marginTop: 4,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>
              {isToSchool ? 'Subió' : 'Bajó'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => act('absent')}
            disabled={acting}
            style={{
              height: 56,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: colors.danger,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: acting ? 0.6 : 1,
            }}
          >
            <Text style={{ color: colors.danger, fontSize: 18, fontWeight: '800' }}>No viaja</Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            borderRadius: 22,
            padding: 20,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700' }}>Ya pasaste por todas las paradas.</Text>
        </View>
      )}

      {upcoming.length > 0 && (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textMuted, marginBottom: 4 }}>
            Después
          </Text>
          {upcoming.map((s) => (
            <Text key={s.studentId} style={{ fontSize: 16, fontWeight: '600', height: 36 }}>
              {s.fullName}
            </Text>
          ))}
        </View>
      )}

      <View style={{ flexGrow: 1 }} />

      <Pressable
        onPress={handleFinish}
        style={{
          height: 54,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: colors.danger,
          backgroundColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>Finalizar recorrido</Text>
      </Pressable>
    </View>
  );
}
