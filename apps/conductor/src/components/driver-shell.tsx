import { useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getActiveTripId, stopSharingLocation } from '@/lib/backgroundLocation';
import { fetchActiveTripId, signOut } from '@/lib/tripApi';
import { colors, radius } from '@/lib/theme';

export function BrandMark({ size = 30 }: { size?: number }) {
  const unit = size / 48;
  return (
    <View accessibilityElementsHidden style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: 8 * unit,
          top: 3 * unit,
          width: 32 * unit,
          height: 32 * unit,
          borderRadius: 16 * unit,
          backgroundColor: colors.yellow,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 17 * unit,
          top: 27 * unit,
          width: 14 * unit,
          height: 14 * unit,
          backgroundColor: colors.yellow,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 12 * unit,
          top: 13 * unit,
          width: 24 * unit,
          height: 14 * unit,
          borderRadius: 3 * unit,
          backgroundColor: colors.navy,
          flexDirection: 'row',
          gap: 3 * unit,
          paddingTop: 3 * unit,
          paddingHorizontal: 3 * unit,
        }}
      >
        <View style={{ width: 7 * unit, height: 5 * unit, borderRadius: unit, backgroundColor: colors.yellow }} />
        <View style={{ width: 7 * unit, height: 5 * unit, borderRadius: unit, backgroundColor: colors.yellow }} />
      </View>
      <View style={{ position: 'absolute', left: 15 * unit, top: 25 * unit, width: 5 * unit, height: 5 * unit, borderRadius: 3 * unit, backgroundColor: colors.navy }} />
      <View style={{ position: 'absolute', left: 28 * unit, top: 25 * unit, width: 5 * unit, height: 5 * unit, borderRadius: 3 * unit, backgroundColor: colors.navy }} />
    </View>
  );
}

export function DriverHeader({ tripId }: { tripId?: string }) {
  const [open, setOpen] = useState(false);
  const [activeTripId, setActiveTripId] = useState<string | null>(tripId ?? null);

  async function openMenu() {
    setActiveTripId(tripId ?? await getActiveTripId() ?? await fetchActiveTripId());
    setOpen(true);
  }

  function navigate(path: '/(driver)/home' | '/(driver)/alumnos' | '/(driver)/compartir' | '/(driver)/perfil') {
    setOpen(false);
    router.push(path);
  }

  function logout() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir de la app?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          setOpen(false);
          try {
            if (activeTripId) await stopSharingLocation();
            await signOut();
            router.replace('/login');
          } catch {
            Alert.alert('No se pudo cerrar sesión', 'Inténtalo nuevamente.');
          }
        },
      },
    ]);
  }

  return (
    <>
      <StatusBar style="light" />
      <View
        style={{
          marginHorizontal: -20,
          marginTop: -56,
          paddingTop: 52,
          paddingBottom: 12,
          paddingHorizontal: 20,
          backgroundColor: colors.navy,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BrandMark size={31} />
          <Text style={{ color: colors.white, fontSize: 15, fontWeight: '900', letterSpacing: 0.4 }}>RUTASEGURA</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir menú"
          onPress={openMenu}
          hitSlop={10}
          style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.65 : 1 })}
        >
          <Text style={{ color: colors.white, fontSize: 25, fontWeight: '700', lineHeight: 25 }}>☰</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: 'rgba(13,21,42,0.46)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel="Cerrar menú" />
          <View style={{ width: '84%', maxWidth: 340, backgroundColor: colors.card }}>
            <View style={{ backgroundColor: colors.navy, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <BrandMark size={31} />
                <Text style={{ color: colors.white, fontWeight: '900' }}>RUTASEGURA</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}><Text style={{ color: colors.white, fontSize: 24 }}>×</Text></Pressable>
            </View>
            <View style={{ padding: 12, gap: 2 }}>
              {activeTripId ? (
                <MenuItem
                  label="Volver al recorrido"
                  detail="En recorrido"
                  icon="●"
                  active
                  onPress={() => {
                    setOpen(false);
                    router.push({ pathname: '/(driver)/trip', params: { tripId: activeTripId } });
                  }}
                />
              ) : null}
              <MenuItem label="Mis rutas" icon="⌂" onPress={() => navigate('/(driver)/home')} />
              <MenuItem label="Mis alumnos" icon="👥" onPress={() => navigate('/(driver)/alumnos')} />
              <MenuItem label="Invitar apoderados" icon="＋" onPress={() => navigate('/(driver)/compartir')} />
              <MenuItem label="Mi perfil" icon="●" onPress={() => navigate('/(driver)/perfil')} />
              <MenuItem label="Ayuda" icon="?" onPress={() => Alert.alert('Ayuda', 'Si tienes problemas con GPS o invitaciones, vuelve a Mis rutas y reintenta. Si continúa, contacta al equipo de RutaSegura.')} />
              <View style={{ height: 1, backgroundColor: colors.cardBorder, marginVertical: 8 }} />
              <MenuItem label="Cerrar sesión" icon="↪" danger onPress={logout} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function MenuItem({ label, detail, icon, active, danger, onPress }: { label: string; detail?: string; icon: string; active?: boolean; danger?: boolean; onPress: () => void }) {
  const fg = danger ? colors.danger : active ? colors.success : colors.navy;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: active ? colors.successBg : pressed ? colors.accentSoft : 'transparent',
      })}
    >
      <Text style={{ width: 25, textAlign: 'center', color: fg, fontSize: 18, fontWeight: '800' }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>{label}</Text>
        {detail ? <Text style={{ color: colors.success, fontSize: 12 }}>{detail}</Text> : null}
      </View>
      {!danger ? <Text style={{ color: colors.textMuted, fontSize: 20 }}>›</Text> : null}
    </Pressable>
  );
}
