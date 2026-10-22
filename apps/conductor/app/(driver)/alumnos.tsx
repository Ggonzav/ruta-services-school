import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { hasActiveTrip, listStudents, type StudentAdmin } from '@/lib/tripApi';
import { colors, radius, typography } from '@/lib/theme';
import { Avatar, Button, Card, Eyebrow, Field, Loading, Screen } from '@/components/ui';

// "Mis alumnos": el transportista ve y administra sus alumnos. Agregar y
// editar van a /(driver)/alumno. Durante un recorrido en curso los cambios
// quedan bloqueados (lo refuerza el backend; aquí lo mostramos y evitamos
// abrir el editor para no confundir).
export default function AlumnosScreen() {
  const [students, setStudents] = useState<StudentAdmin[]>([]);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, activeTrip] = await Promise.all([listStudents(), hasActiveTrip()]);
      setStudents(rows);
      setActive(activeTrip);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <Loading />;

  const q = query.trim().toLowerCase();
  const visible = q ? students.filter((s) => s.fullName.toLowerCase().includes(q)) : students;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => router.replace('/(driver)/home')}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: radius.pill,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>← Volver</Text>
        </Pressable>
        <Button
          title="+ Agregar"
          size="md"
          onPress={() => router.push('/(driver)/alumno')}
          disabled={active}
          style={{ paddingHorizontal: 18 }}
        />
      </View>

      <View>
        <Eyebrow>🚌 RUTASEGURA</Eyebrow>
        <Text style={typography.h2}>Mis alumnos</Text>
      </View>

      {active && (
        <Card style={{ backgroundColor: '#FFF7E6', borderColor: '#F4E1B0' }}>
          <Text style={{ color: '#8A5A00', fontSize: 13.5, fontWeight: '600' }}>
            Hay un recorrido en curso. Los cambios a alumnos y paradas quedan bloqueados hasta finalizarlo.
          </Text>
        </Card>
      )}

      <Field label="Buscar" placeholder="Buscar alumno…" value={query} onChangeText={setQuery} />

      <FlatList
        data={visible}
        keyExtractor={(s) => s.id}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <Text style={[typography.muted, { textAlign: 'center', marginTop: 20 }]}>
            {q ? 'Sin resultados.' : 'Aún no tienes alumnos. Toca "+ Agregar".'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/(driver)/alumno', params: { id: item.id } })}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={item.fullName} size={46} />
              <View style={{ flexShrink: 1, flexGrow: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{item.fullName}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {item.assignments.length === 0 ? (
                    <Text style={typography.small}>Sin ruta asignada</Text>
                  ) : (
                    item.assignments.map((a) => (
                      <View
                        key={a.routeId}
                        style={{ backgroundColor: colors.chipBg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.accent }}>{a.kind === 'AM' ? 'Ida' : 'Regreso'}</Text>
                      </View>
                    ))
                  )}
                  <Text style={{ fontSize: 11, fontWeight: '800', color: item.hasGuardian ? colors.success : colors.textMuted }}>
                    {item.hasGuardian ? '· Acceso activado' : item.hasContact ? '· Contacto guardado · Invitar apoderado' : '· Completar datos del apoderado'}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 22, color: colors.textMuted }}>›</Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
