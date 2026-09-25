// ============================================================================
// Cliente de Supabase para la app del conductor. Usa AsyncStorage para que
// la sesión sobreviva a cerrar la app (el conductor no debería tener que
// loguearse cada mañana antes de salir).
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

const SUPABASE_URL = extra.supabaseUrl as string;
const SUPABASE_ANON_KEY = extra.supabaseAnonKey as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Falla fuerte y temprano: mejor una pantalla roja en desarrollo que un
  // "trip_not_found" confuso más tarde porque nunca hubo sesión.
  throw new Error(
    'Falta configurar supabaseUrl / supabaseAnonKey en app.json (expo.extra). Ver apps/conductor/README.md.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
