import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Share } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { createInviteLink } from '@/lib/tripApi';
import { colors } from '@/lib/theme';

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
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 56, paddingHorizontal: 20, gap: 16 }}>
      <Pressable
        onPress={() => router.replace('/(driver)/home')}
        style={{
          alignSelf: 'flex-start',
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>← Volver</Text>
      </Pressable>
      <Text style={{ fontSize: 34, fontWeight: '700' }}>Invitar apoderados</Text>
      <Text style={{ fontSize: 16, color: colors.textMuted }}>
        Cada alumno tiene su propio link. El apoderado lo abre, pone su nombre y ya puede ver el
        recorrido — no necesita instalar nada.
      </Text>
      <FlatList
        data={students}
        keyExtractor={(s) => s.id}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.cardBorder,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600' }}>{item.fullName}</Text>
            <Pressable
              onPress={() => handleShare(item)}
              disabled={sharingId === item.id}
              style={{
                height: 44,
                paddingHorizontal: 18,
                borderRadius: 12,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {sharingId === item.id ? (
                <ActivityIndicator />
              ) : (
                <Text style={{ fontWeight: '700' }}>Compartir</Text>
              )}
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
