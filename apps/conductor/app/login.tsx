import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

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
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 72, gap: 16 }}>
      <View style={{ alignItems: 'center', marginBottom: 22 }}>
        <Text style={{ fontSize: 54 }}>🚌</Text>
        <Text style={{ fontFamily: 'System', fontSize: 34, fontWeight: '800', color: colors.text }}>
          RutaSegura
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, fontWeight: '600' }}>
          Transporte Escolar
        </Text>
      </View>

      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
        Iniciar sesión
      </Text>
      <Text style={{ fontSize: 16, color: colors.textMuted, marginBottom: 12 }}>
        Ingresa con la cuenta que te dimos al empezar el piloto.
      </Text>

      <TextInput
        placeholder="Correo"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={inputStyle}
      />
      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={inputStyle}
      />

      {errorMsg && <Text style={{ color: colors.danger }}>{errorMsg}</Text>}

      <Pressable
        onPress={handleLogin}
        disabled={loading || !email || !password}
        style={{
          height: 56,
          borderRadius: 16,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: loading || !email || !password ? 0.5 : 1,
        }}
      >
        {loading ? <ActivityIndicator /> : <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>Entrar</Text>}
      </Pressable>
      <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 13, marginTop: 'auto' }}>
        Juntos en cada trayecto
      </Text>
    </View>
  );
}

const inputStyle = {
  height: 52,
  borderWidth: 1.5,
  borderColor: '#C9C1AF',
  borderRadius: 14,
  paddingHorizontal: 14,
  fontSize: 17,
  backgroundColor: '#FFFFFF',
} as const;
