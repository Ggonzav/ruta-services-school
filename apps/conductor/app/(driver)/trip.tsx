import { useCallback, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { finishTrip, markStop } from '@/lib/tripApi';
import { stopSharingLocation } from '@/lib/backgroundLocation';
import { nextPendingStop, tripProgress, upcomingStops, type Stop } from '@/lib/tripLogic';
import { colors, typography } from '@/lib/theme';
import { directionForKind, type RouteDirection, type RouteKind } from '../../../../shared/rutasegura-api';
import { Avatar, Button, Card, Eyebrow, Loading, Pill, ProgressBar, Screen, Snackbar, Spacer } from '@/components/ui';

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
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const isToSchool = direction === 'to_school';

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  async function act(action: 'completed' | 'absent') {
    if (!current) return;
    const stop = current;
    setActing(true);
    try {
      await markStop(tripId, stop.studentId, action);
      setSettled((prev) => new Set(prev).add(stop.studentId));
      const verb = action === 'absent' ? 'No viaja' : isToSchool ? 'Subió' : 'Bajó';
      showToast(`${stop.fullName} · ${verb}`);
    } catch (err) {
      Alert.alert('No se pudo registrar', 'Intenta de nuevo.');
    } finally {
      setActing(false);
    }
  }

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

  if (loading) return <Loading />;

  return (
    <Screen style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pill label="En recorrido" />
        <Text style={{ color: colors.success, fontWeight: '800' }}>GPS activo</Text>
      </View>

      <ProgressBar done={progress.done} total={progress.total} />

      {current ? (
        <>
          <Eyebrow>PARADA ACTUAL</Eyebrow>
          <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
            <Avatar name={current.fullName} />
            <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: colors.blue }}>
              PARADA {Math.min(progress.done + 1, progress.total)} DE {progress.total}
            </Text>
            <Text style={[typography.h2, { textAlign: 'center' }]}>{current.fullName}</Text>
            <Text style={[typography.small, { textAlign: 'center' }]}>{current.address}</Text>
          </Card>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title={isToSchool ? 'Subió' : 'Bajó'}
              variant="success"
              onPress={() => act('completed')}
              disabled={acting}
              style={{ flex: 1 }}
            />
            <Button title="No viaja" variant="danger" onPress={() => act('absent')} disabled={acting} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <Card>
          <Text style={typography.title}>Ya pasaste por todas las paradas.</Text>
        </Card>
      )}

      {upcoming.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={[typography.small, { fontWeight: '700' }]}>Siguen</Text>
          {upcoming.map((s) => (
            <Text key={s.studentId} style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
              {s.fullName}
            </Text>
          ))}
        </View>
      )}

      <Spacer />

      <Button
        title="Finalizar recorrido"
        variant="neutralGhost"
        size="md"
        onPress={handleFinish}
        style={{ marginBottom: 20 }}
      />

      {toast && <Snackbar text={toast} />}
    </Screen>
  );
}
