import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { fetchCarrierProfile, saveCarrierProfile, signOut } from '@/lib/tripApi';
import { colors, radius, typography } from '@/lib/theme';
import { Avatar, Button, Card, ErrorText, Field, Loading, Screen, Spacer } from '@/components/ui';
import { DriverHeader } from '@/components/driver-shell';

// Perfil del transportista: nombre, teléfono y foto que el apoderado verá como
// "tarjeta del conductor" (vía guardian_trip_driver). Aquí también vive el
// cierre de sesión — antes no había forma de salir dentro de la app.
export default function PerfilScreen() {
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchCarrierProfile();
      if (p) {
        setFullName(p.fullName);
        setPhone(p.phone);
        setPhotoUrl(p.photoUrl ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSave() {
    if (!fullName.trim()) return setError('El nombre es obligatorio.');
    setError(null);
    setSavedMsg(false);
    setSaving(true);
    try {
      await saveCarrierProfile({ fullName, phone, photoUrl: photoUrl || null });
      setSavedMsg(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar el perfil.');
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir de la app?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/login');
          } catch {
            Alert.alert('No se pudo cerrar sesión', 'Inténtalo nuevamente.');
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <DriverHeader />

      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar name={fullName || 'Conductor'} size={72} />
        <Text style={typography.h2}>Mi perfil</Text>
        <Text style={[typography.small, { textAlign: 'center' }]}>
          Esto es lo que verá el apoderado como conductor del furgón.
        </Text>
      </View>

      <Field label="Nombre" placeholder="Nombre y apellido" value={fullName} onChangeText={setFullName} />
      <Field
        label="Teléfono"
        placeholder="+56 9 1234 5678"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <Field
        label="Foto (enlace, opcional)"
        placeholder="https://…"
        autoCapitalize="none"
        value={photoUrl}
        onChangeText={setPhotoUrl}
      />

      {error && <ErrorText>{error}</ErrorText>}
      {savedMsg && (
        <Card style={{ backgroundColor: colors.successBg, borderColor: colors.successBg }}>
          <Text style={{ color: colors.success, fontWeight: '700' }}>Perfil guardado.</Text>
        </Card>
      )}

      <Button title="Guardar" onPress={handleSave} loading={saving} />

      <Spacer />

      <View style={{ borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 16, gap: 8, marginBottom: 12 }}>
        <Button title="Cerrar sesión" variant="danger" size="md" onPress={handleLogout} />
        <Text style={[typography.small, { textAlign: 'center' }]}>
          Saldrás de la app en este dispositivo y volverás a la pantalla de ingreso.
        </Text>
      </View>
    </Screen>
  );
}
