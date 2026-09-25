import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

// Punto de entrada: manda a /login o directo a /(driver)/home según si ya
// hay sesión guardada (AsyncStorage), para que el conductor no tenga que
// loguearse cada vez que abre la app.
export default function Index() {
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
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={hasSession ? '/(driver)/home' : '/login'} />;
}
