import { useCallback, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { createInviteLink, hasActiveTrip, listStudents, type StudentAdmin } from '@/lib/tripApi';
import { Avatar, Badge, Button, Card, Loading, Screen } from '@/components/ui';
import { DriverHeader } from '@/components/driver-shell';
import { colors, typography } from '@/lib/theme';

export default function AlumnoDetalleScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [student, setStudent] = useState<StudentAdmin | null>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [students, hasTrip] = await Promise.all([listStudents(), hasActiveTrip()]);
      setStudent(students.find((item) => item.id === id) ?? null);
      setActive(hasTrip);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function invite() {
    if (!student) return;
    setSharing(true);
    try {
      const webBaseUrl = (Constants.expoConfig?.extra?.webBaseUrl as string) ?? '';
      const { shareText } = await createInviteLink(student.id, student.fullName.split(' ')[0], webBaseUrl);
      await Share.share({ message: shareText });
    } catch (error) {
      Alert.alert('No se pudo crear la invitación', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally {
      setSharing(false);
    }
  }

  if (loading) return <Loading />;
  if (!student) {
    return (
      <Screen>
        <DriverHeader />
        <Text style={typography.h2}>Alumno no encontrado</Text>
        <Button title="Volver a Mis alumnos" onPress={() => router.replace('/(driver)/alumnos')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <DriverHeader />
      <Text onPress={() => router.back()} style={{ color: colors.navy, fontWeight: '700' }}>← Volver</Text>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar name={student.fullName} size={82} />
        <Text style={typography.h2}>{student.fullName}</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>{student.address || 'Sin dirección registrada'}</Text>
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={typography.label}>RUTAS ASIGNADAS</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {student.assignments.length ? student.assignments.map((assignment) => (
            <Badge key={assignment.routeId} label={assignment.kind === 'AM' ? 'Ida · Casa → Colegio' : 'Vuelta · Colegio → Casa'} tone="muted" />
          )) : <Text style={typography.small}>Sin ruta asignada</Text>}
        </View>
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={typography.label}>APODERADO</Text>
        <Text style={typography.title}>{student.guardianName || 'Datos pendientes'}</Text>
        {student.guardianPhone ? <Text style={typography.muted}>{student.guardianPhone}</Text> : null}
        <Badge label={student.hasGuardian ? 'Acceso activado' : 'Invitación pendiente'} tone={student.hasGuardian ? 'success' : 'muted'} />
      </Card>

      {active ? (
        <Card style={{ backgroundColor: '#FFF7E6', borderColor: '#F4E1B0' }}>
          <Text style={{ color: '#8A5A00', fontWeight: '600' }}>Finaliza el recorrido en curso antes de editar alumnos o rutas.</Text>
        </Card>
      ) : null}

      <Button title="Editar alumno" onPress={() => router.push({ pathname: '/(driver)/alumno', params: { id: student.id } })} disabled={active} />
      <Button title="Invitar apoderado" variant="ghost" size="md" onPress={invite} loading={sharing} />
    </Screen>
  );
}
