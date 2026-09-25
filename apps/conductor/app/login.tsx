import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, typography } from '@/lib/theme';
import { Button, ErrorText, Field, Screen, Spacer } from '@/components/ui';

// Login con email + contraseña. Para el piloto (5 transportistas) la
// cuenta se la creamos nosotros a mano en el dashboard de Supabase — no
// hay flujo de "olvidé mi contraseña" ni de auto-registro todavía. Un
// login por SMS/OTP es el paso natural después del piloto, cuando ya no
// sea el equipo el que da de alta cada furgón uno a uno.
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setErrorMsg(`No pudimos iniciar sesión: ${error.message}`);
      return;
    }
    router.replace('/(driver)/home');
  }

  return (
    <Screen style={{ paddingTop: 72 }}>
      <Spacer />
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 74,
            height: 74,
            borderRadius: 22,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 38 }}>🚌</Text>
        </View>
        <Text style={[typography.display, { fontSize: 30 }]}>RutaSegura</Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, fontWeight: '600' }}>Transporte Escolar</Text>
      </View>

      <View style={{ gap: 4 }}>
        <Text style={[typography.h2, { fontSize: 22 }]}>Iniciar sesión</Text>
        <Text style={typography.muted}>Ingresa con la cuenta que te dimos al empezar el piloto.</Text>
      </View>

      <Field
        label="Correo"
        placeholder="tucorreo@ejemplo.cl"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Field label="Contraseña" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} />

      {errorMsg && <ErrorText>{errorMsg}</ErrorText>}

      <Button title="Entrar" onPress={handleLogin} loading={loading} disabled={!email || !password} />

      <Spacer />
      <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 13, marginBottom: 12 }}>
        Juntos en cada trayecto
      </Text>
    </Screen>
  );
}
