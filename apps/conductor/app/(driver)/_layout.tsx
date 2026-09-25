import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Slot } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

// Guarda de sesión para todo el grupo (driver): si no hay sesión, manda a
// /login. Cada pantalla hija (home, trip, summary, compartir) asume que ya
// hay un conductor logueado.
export default function DriverLayout() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setHasSession(!!data.session);
      })
      .catch(() => {
        setHasSession(false);
      })
      .finally(() => {
        setChecking(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!hasSession) return <Redirect href="/login" />;

  return <Slot />;
}
