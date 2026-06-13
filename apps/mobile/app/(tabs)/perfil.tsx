import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, CardLabel } from '../../src/components/Card.js';
import { Chip } from '../../src/components/Chip.js';
import { MobileHeader } from '../../src/components/Header.js';
import { useAuth } from '../../src/lib/auth-ctx.js';
import { COLORS, RADIUS } from '../../src/lib/colors.js';

export default function PerfilScreen(): JSX.Element {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  const initials = (user?.nombre ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <View style={styles.wrap}>
      <MobileHeader title="Perfil" />

      <View style={styles.body}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.nombre ?? '—'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Chip
          label={user?.kind === 'SUPER_ADMIN' ? 'Super admin' : user?.kind === 'ADMIN' ? 'Administradora' : 'Vecino'}
          variant="blue"
          style={{ marginTop: 8 }}
        />

        <Card style={styles.section}>
          <CardLabel>Cuenta</CardLabel>
          <Row k="Email" v={user?.email ?? '—'} />
          <Row k="Rol" v={user?.kind ?? '—'} />
        </Card>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
          onPress={onLogout}
        >
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{k}</Text>
      <Text style={styles.rowV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg },
  body: { padding: 18, alignItems: 'center' },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.blue700,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8, marginBottom: 14,
  },
  avatarText: { color: 'white', fontSize: 28, fontWeight: '700', letterSpacing: -1 },
  name: { fontSize: 19, fontWeight: '700', color: COLORS.ink },
  email: { fontSize: 13, color: COLORS.ink3, marginTop: 3 },
  section: { width: '100%', marginTop: 24 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: COLORS.line2, borderBottomWidth: 1,
  },
  rowK: { fontSize: 12, color: COLORS.ink3, fontWeight: '600' },
  rowV: { fontSize: 13, color: COLORS.ink },
  logoutBtn: {
    width: '100%', marginTop: 20,
    paddingVertical: 13, borderRadius: RADIUS.base,
    borderWidth: 1, borderColor: COLORS.critical,
    alignItems: 'center',
  },
  logoutText: { color: COLORS.critical, fontWeight: '600', fontSize: 14 },
});
