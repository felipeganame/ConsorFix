import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { login as apiLogin, setToken } from '../src/lib/api.js';
import { useAuth } from '../src/lib/auth-ctx.js';
import { COLORS, RADIUS } from '../src/lib/colors.js';

const DEMO = [
  { email: 'propi@consorciofix.dev', pwd: 'resi123', tag: 'Propietaria 4A' },
  { email: 'inqui@consorciofix.dev', pwd: 'resi123', tag: 'Inquilina 4A' },
  { email: 'admin@consorciofix.dev', pwd: 'admin123', tag: 'Administradora' },
];

export default function LoginScreen(): JSX.Element {
  const { setSession } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('propi@consorciofix.dev');
  const [password, setPassword] = useState('resi123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      const r = await apiLogin(email.trim(), password);
      await setToken(r.accessToken);
      await setSession(r.user);
      router.replace('/(tabs)/feed');
    } catch (err) {
      setError((err as Error).message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>CF</Text>
          </View>
          <Text style={styles.brandTitle}>ConsorcioFix</Text>
          <Text style={styles.brandSub}>Tu consorcio en un toque</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="vos@dominio.com"
            placeholderTextColor={COLORS.ink4}
          />
          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={COLORS.ink4}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              (pressed || loading) && styles.buttonPressed,
            ]}
            onPress={onSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Entrando…' : 'Entrar'}</Text>
          </Pressable>

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Cuentas demo</Text>
            {DEMO.map((d) => (
              <Pressable
                key={d.email}
                style={({ pressed }) => [styles.demoRow, pressed && { backgroundColor: COLORS.blue50 }]}
                onPress={() => {
                  setEmail(d.email);
                  setPassword(d.pwd);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.demoEmail}>{d.email}</Text>
                  <Text style={styles.demoTag}>{d.tag}</Text>
                </View>
                <Text style={styles.demoArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.blue900 },
  scroll: { padding: 22, justifyContent: 'center', flexGrow: 1 },
  brand: { alignItems: 'center', marginBottom: 26 },
  logo: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: COLORS.blue700,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: { color: 'white', fontSize: 22, fontWeight: '700', letterSpacing: -1 },
  brandTitle: { color: 'white', fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  brandSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 22,
  },
  label: {
    fontSize: 11, color: COLORS.ink3, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginBottom: 6, marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.line, borderWidth: 1, borderRadius: RADIUS.base,
    paddingHorizontal: 14, height: 44, fontSize: 15, color: COLORS.ink,
  },
  error: {
    color: COLORS.critical, backgroundColor: COLORS.criticalBg,
    padding: 10, borderRadius: 8, marginTop: 12, fontSize: 12.5,
  },
  button: {
    backgroundColor: COLORS.blue700,
    paddingVertical: 14, borderRadius: RADIUS.base,
    alignItems: 'center', marginTop: 18,
  },
  buttonPressed: { backgroundColor: COLORS.blue800 },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 15 },
  demoBox: { marginTop: 20, borderTopColor: COLORS.line, borderTopWidth: 1, paddingTop: 14 },
  demoTitle: {
    fontSize: 11, color: COLORS.ink3, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
  },
  demoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8,
  },
  demoEmail: { fontSize: 12.5, color: COLORS.ink, fontFamily: 'Menlo' },
  demoTag: { fontSize: 11, color: COLORS.ink3, marginTop: 1 },
  demoArrow: { color: COLORS.ink4, fontSize: 16 },
});
