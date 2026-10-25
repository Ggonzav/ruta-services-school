import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Share } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { createInviteLink } from '@/lib/tripApi';
import { colors } from '@/lib/theme';
import { Button, Card, Loading, Screen } from '@/components/ui';
import { DriverHeader } from '@/components/driver-shell';

interface StudentRow {
  id: string;
  fullName: string;
}

// Pantalla del transportista para compartir la invitación (pantalla 7 del
// prototipo la ve el apoderado al abrir el link; ésta es la que arma el
// link, del lado del conductor). Un botón por alumno abre el selector
// nativo de compartir (WhatsApp, SMS, lo que tenga instalado el teléfono).
export default function CompartirScreen() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('students')
        .select('id, full_name')
        .order('full_name', { ascending: true })
        .then(({ data }) => {
          setStudents((data ?? []).map((s) => ({ id: s.id, fullName: s.full_name })));
          setLoading(false);
        });
    }, [])
  );

  async function handleShare(student: StudentRow) {
    setSharingId(student.id);
    try {
      const webBaseUrl = (Constants.expoConfig?.extra?.webBaseUrl as string) ?? '';
      const firstName = student.fullName.split(' ')[0];
      const { shareText } = await createInviteLink(student.id, firstName, webBaseUrl);
      await Share.share({ message: shareText });
    } finally {
      setSharingId(null);
    }
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <Screen>
      <DriverHeader />
      <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>Invitar apoderados</Text>
      <Text style={{ fontSize: 16, color: colors.textMuted }}>
        Cada alumno tiene su propio link. El apoderado lo abre, pone su nombre y ya puede ver el
        recorrido — no necesita instalar nada.
      </Text>
      <FlatList
        data={students}
        keyExtractor={(s) => s.id}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, flex: 1 }}>{item.fullName}</Text>
            <Button title="Compartir" size="md" onPress={() => handleShare(item)} loading={sharingId === item.id} style={{ minWidth: 118 }} />
          </Card>
        )}
      />
    </Screen>
  );
}
