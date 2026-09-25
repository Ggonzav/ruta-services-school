import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { finishTrip, type TripSummary } from '@/lib/tripApi';
import { formatDuration } from '@/lib/tripLogic';
import { colors } from '@/lib/theme';

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

  if (!summary) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const duration = formatDuration(new Date(summary.startedAt), new Date(summary.endedAt));
  const isToSchool = summary.direction === 'to_school';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 96, paddingHorizontal: 20, gap: 22 }}>
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: colors.success,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 32 }}>✓</Text>
        </View>
        <Text style={{ fontSize: 34, fontWeight: '800', color: colors.text, textAlign: 'center' }}>¡Recorrido finalizado!</Text>
        <Text style={{ fontSize: 16, color: colors.textMuted, textAlign: 'center' }}>
          Dejaste de compartir tu ubicación. Los apoderados ya ven que {isToSchool ? 'llegaron al colegio' : 'llegaron a casa'}.
        </Text>
      </View>

      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 18 }}>
        <SummaryRow label="Alumnos" value={summary.total} />
        <SummaryRow label={isToSchool ? 'Subieron' : 'Bajaron'} value={summary.completed} />
        <SummaryRow label="No viajó" value={summary.absent} />
        <SummaryRow label={isToSchool ? 'Llegaron al colegio' : 'Llegaron a casa'} value={summary.completed} />
        <SummaryRow label="Duración" value={duration} last />
      </View>

      <View style={{ flexGrow: 1 }} />

      <Pressable
        onPress={() => router.replace('/(driver)/home')}
        style={{
          height: 60,
          borderRadius: 18,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '800' }}>Volver a mis rutas</Text>
      </Pressable>
    </View>
  );
}

function SummaryRow({ label, value, last = false }: { label: string; value: number | string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 56,
        paddingHorizontal: 18,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: '#EFE9DA',
      }}
    >
      <Text style={{ fontSize: 17 }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
