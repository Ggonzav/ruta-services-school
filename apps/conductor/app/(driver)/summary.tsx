import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { finishTrip, type TripSummary } from '@/lib/tripApi';
import { formatDuration } from '@/lib/tripLogic';
import { colors, radius, typography } from '@/lib/theme';
import { Button, Card, Loading, Screen, Spacer } from '@/components/ui';

// Pantalla 3 del prototipo visual. finishTrip ya se llamó desde trip.tsx
// (para cerrar el recorrido cuanto antes); acá sólo se relee el resumen
// para mostrarlo — llamar finish_trip dos veces es seguro porque el RPC
// es idempotente sobre un trip ya finalizado (falla con un error que acá
// ignoramos a propósito).
export default function SummaryScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [summary, setSummary] = useState<TripSummary | null>(null);

  useEffect(() => {
    finishTrip(tripId)
      .then(setSummary)
      .catch(() => {
        /* ya estaba finalizado: no es un error para el usuario */
      });
  }, [tripId]);

  if (!summary) return <Loading />;

  const duration = formatDuration(new Date(summary.startedAt), new Date(summary.endedAt));
  const isToSchool = summary.direction === 'to_school';
  const arrivalLabel = isToSchool ? 'Todos llegaron al colegio' : 'Todos llegaron a casa';

  return (
    <Screen style={{ paddingTop: 88, gap: 20 }}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: colors.successBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.success, fontSize: 34, fontWeight: '800' }}>✓</Text>
        </View>
        <Text style={[typography.display, { textAlign: 'center' }]}>Recorrido finalizado</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>
          Dejaste de compartir tu ubicación. Los apoderados ya ven que {isToSchool ? 'llegaron al colegio' : 'llegaron a casa'}.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile value={summary.completed} label={isToSchool ? 'SUBIERON' : 'BAJARON'} />
        <StatTile value={summary.absent} label="NO VIAJARON" />
        <StatTile value={summary.total} label="TOTAL" />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.successBg,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text style={{ fontSize: 16 }}>🏫</Text>
        <Text style={{ color: colors.success, fontWeight: '700', fontSize: 13.5, flexShrink: 1 }}>{arrivalLabel}</Text>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.body}>Duración</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{duration}</Text>
        </View>
      </Card>

      <Spacer />
      <Button title="Volver a mis rutas" onPress={() => router.replace('/(driver)/home')} style={{ marginBottom: 24 }} />
    </Screen>
  );
}

function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.textMuted, marginTop: 2 }}>{label}</Text>
    </Card>
  );
}
