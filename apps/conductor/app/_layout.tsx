import '@/lib/backgroundLocation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';

LogBox.ignoreLogs([
  'Possible unhandled promise rejection',
  'No native splash screen registered for given view controller',
]);

// Layout raíz: sólo define el stack de navegación. La decisión de mandar
// al conductor a /login o a /(driver)/home vive en cada pantalla (chequea
// supabase.auth.getSession()) para mantener esto simple en el MVP; con más
// pantallas convendría un guard centralizado acá.
export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(driver)" />
      </Stack>
    </>
  );
}
