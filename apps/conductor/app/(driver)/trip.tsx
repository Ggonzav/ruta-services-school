import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { finishTrip, markStop, setTarget, getTarget } from '@/lib/tripApi';
import { stopSharingLocation } from '@/lib/backgroundLocation';
import { tripProgress, type Stop } from '@/lib/tripLogic';
import { colors, radius, typography } from '@/lib/theme';
import { directionForKind, type RouteDirection, type RouteKind } from '../../../../shared/rutasegura-api';
import { Avatar, Button, Card, Eyebrow, Loading, Pill, ProgressBar, Screen, Snackbar, Spacer } from '@/components/ui';

// El conductor elige a quién atiende ahora (en cualquier orden). Al tocar un
// alumno, ese pasa a ser el "destino actual" del furgón (driver_set_target),
// y el apoderado de ESE niño ve "el furgón va hacia tu casa". Al marcarlo, el
// destino se limpia y el conductor elige la siguiente parada.
export default function TripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [stops, setStops] = useState<Stop[]>([]);
  const [settled, setSettled] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState<RouteDirection>('to_school');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const { data: trip } = await supabase
      .from('trips')
      .select('route_id, routes(kind)')
      .eq('id', tripId)
      .single();
    if (!trip) return;
    const routeKind = ((trip as any).routes?.kind ?? 'AM') as RouteKind;
    setDirection(directionForKind(routeKind));
    setTargetId(await getTarget(tripId));

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
      void load().catch(() => {
        setLoading(false);
        Alert.alert('No se pudo cargar el recorrido', 'Vuelve a abrirlo para reintentar.');
      });
    }, [load])
  );

  const isToSchool = direction === 'to_school';
  const progress = tripProgress(stops, settled);
  const pending = stops.filter((s) => !settled.has(s.studentId)).sort((a, b) => a.seq - b.seq);
  const current = targetId ? pending.find((s) => s.studentId === targetId) ?? null : null;
  const others = pending.filter((s) => s.studentId !== current?.studentId);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  async function choose(studentId: string) {
    setActing(true);
    try {
      await setTarget(tripId, studentId);
      setTargetId(studentId);
    } catch {
      Alert.alert('No se pudo elegir la parada', 'Intenta de nuevo.');
    } finally {
      setActing(false);
    }
  }

  async function act(action: 'completed' | 'absent') {
    if (!current) return;
    const stop = current;
    setActing(true);
    try {
      await markStop(tripId, stop.studentId, action);
      setSettled((prev) => new Set(prev).add(stop.studentId));
      setTargetId(null); // el trigger ya lo limpió en el servidor
      const verb = action === 'absent' ? 'No viaja' : isToSchool ? 'Subió' : 'Bajó';
      showToast(`${stop.fullName} · ${verb}`);
    } catch {
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
          <Eyebrow>{isToSchool ? 'VAS A BUSCAR A' : 'VAS A DEJAR A'}</Eyebrow>
          <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
            <Avatar name={current.fullName} />
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
      ) : pending.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Eyebrow>ELIGE LA PRÓXIMA PARADA</Eyebrow>
          <Text style={typography.small}>Toca al alumno al que vas ahora.</Text>
        </View>
      ) : (
        <Card>
          <Text style={typography.title}>Ya pasaste por todas las paradas.</Text>
          <Text style={[typography.small, { marginTop: 4 }]}>Finaliza el recorrido abajo.</Text>
        </Card>
      )}

      {others.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={[typography.small, { fontWeight: '700' }]}>{current ? 'Otras paradas' : 'Pendientes'}</Text>
          {others.map((s) => (
            <Pressable
              key={s.studentId}
              onPress={() => choose(s.studentId)}
              disabled={acting}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  borderRadius: radius.md,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Avatar name={s.fullName} size={38} />
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{s.fullName}</Text>
                <Text style={typography.small} numberOfLines={1}>
                  {s.address}
                </Text>
              </View>
              <Spacer />
              <Text style={{ color: colors.blue, fontWeight: '800', fontSize: 13 }}>Ir →</Text>
            </Pressable>
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
