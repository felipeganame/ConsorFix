import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, CardLabel } from '../../src/components/Card.js';
import { Chip } from '../../src/components/Chip.js';
import { MobileHeader } from '../../src/components/Header.js';
import { useAuth } from '../../src/lib/auth-ctx.js';
import { inviteInquilino, misVinculos, type Vinculo } from '../../src/lib/api.js';
import { COLORS, RADIUS } from '../../src/lib/colors.js';

const ROL_LABEL: Record<Vinculo['rol'], string> = {
  PROPIETARIO: 'Propietario/a',
  INQUILINO: 'Inquilino/a',
};

export default function PerfilScreen(): JSX.Element {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);

  // Alta de inquilino por el propietario. Solo se ofrece para las unidades donde
  // el usuario ES propietario: en las demás la API responde 403, y mostrar el
  // formulario ahí sería ofrecer algo que no puede terminar bien.
  const propias = vinculos.filter((v) => v.rol === 'PROPIETARIO');
  const [invitarEn, setInvitarEn] = useState<Vinculo | null>(null);
  const [invNombre, setInvNombre] = useState('');
  const [invTel, setInvTel] = useState('+54');
  const [invEmail, setInvEmail] = useState('');
  const [invPass, setInvPass] = useState('');
  const [invBusy, setInvBusy] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invOk, setInvOk] = useState<string | null>(null);

  function cargarVinculos() {
    if (user?.kind === 'RESIDENTE') misVinculos().then(setVinculos).catch(() => {});
  }
  useEffect(cargarVinculos, [user?.kind]);

  function cerrarInvitacion() {
    setInvitarEn(null);
    setInvNombre('');
    setInvTel('+54');
    setInvEmail('');
    setInvPass('');
    setInvError(null);
  }

  async function onInvitar() {
    if (!invitarEn) return;
    setInvBusy(true);
    setInvError(null);
    setInvOk(null);
    try {
      await inviteInquilino({
        unidad_id: invitarEn.unidadId,
        nombre: invNombre.trim(),
        telefono_e164: invTel.trim(),
        email: invEmail.trim(),
        password: invPass,
      });
      setInvOk(`Listo. ${invNombre.trim()} ya puede entrar con ${invEmail.trim()}.`);
      cerrarInvitacion();
      cargarVinculos();
    } catch (e) {
      setInvError((e as Error).message);
    } finally {
      setInvBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  const initials = (user?.nombre ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <View style={styles.wrap}>
      <MobileHeader title="Perfil" />

      <ScrollView contentContainerStyle={styles.body}>
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

        {vinculos.length > 0 && (
          <Card style={styles.section}>
            <CardLabel>Tus vínculos</CardLabel>
            {vinculos.map((v) => (
              <Row
                key={v.vinculoId}
                k={v.consorcioNombre}
                v={`${ROL_LABEL[v.rol]} · ${v.unidadEtiqueta}`}
              />
            ))}
          </Card>
        )}

        {propias.length > 0 && (
          <Card style={styles.section}>
            <CardLabel>Inquilinos</CardLabel>
            <Text style={styles.hint}>
              Como propietario/a podés dar de alta al inquilino de tu unidad. Va a poder reportar
              y ver los reportes de esa unidad con su propio usuario.
            </Text>
            {invOk && <Text style={styles.ok}>{invOk}</Text>}

            {!invitarEn ? (
              propias.map((v) => (
                <Pressable
                  key={v.vinculoId}
                  style={({ pressed }) => [styles.inviteBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    setInvOk(null);
                    setInvitarEn(v);
                  }}
                >
                  <Text style={styles.inviteText}>
                    Dar de alta un inquilino en {v.unidadEtiqueta}
                  </Text>
                </Pressable>
              ))
            ) : (
              <View>
                <Text style={styles.formTitle}>
                  Inquilino de {invitarEn.unidadEtiqueta} · {invitarEn.consorcioNombre}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre y apellido"
                  placeholderTextColor={COLORS.ink3}
                  value={invNombre}
                  onChangeText={setInvNombre}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Teléfono (+5491100000000)"
                  placeholderTextColor={COLORS.ink3}
                  value={invTel}
                  onChangeText={setInvTel}
                  keyboardType="phone-pad"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={COLORS.ink3}
                  value={invEmail}
                  onChangeText={setInvEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Contraseña inicial (mínimo 6)"
                  placeholderTextColor={COLORS.ink3}
                  value={invPass}
                  onChangeText={setInvPass}
                  secureTextEntry
                />
                {invError && <Text style={styles.error}>{invError}</Text>}
                <View style={styles.formActions}>
                  <Pressable
                    style={({ pressed }) => [styles.inviteBtn, { flex: 1 }, pressed && { opacity: 0.85 }]}
                    onPress={onInvitar}
                    disabled={invBusy || !invNombre || !invEmail || invPass.length < 6}
                  >
                    <Text style={styles.inviteText}>{invBusy ? 'Dando de alta…' : 'Dar de alta'}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}
                    onPress={cerrarInvitacion}
                  >
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Card>
        )}

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
          onPress={onLogout}
        >
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
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
  hint: { fontSize: 12.5, color: COLORS.ink3, lineHeight: 18, marginBottom: 10 },
  formTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: COLORS.line2, borderRadius: RADIUS.base,
    paddingHorizontal: 11, paddingVertical: 10, marginBottom: 8,
    fontSize: 14, color: COLORS.ink, backgroundColor: 'white',
  },
  formActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  inviteBtn: {
    backgroundColor: COLORS.blue700, borderRadius: RADIUS.base,
    paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginTop: 4,
  },
  inviteText: { color: 'white', fontWeight: '600', fontSize: 13.5 },
  cancelBtn: {
    borderWidth: 1, borderColor: COLORS.line2, borderRadius: RADIUS.base,
    paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginTop: 4,
  },
  cancelText: { color: COLORS.ink2, fontWeight: '600', fontSize: 13.5 },
  ok: { color: COLORS.resolved, fontSize: 12.5, marginBottom: 8 },
  error: { color: COLORS.critical, fontSize: 12.5, marginBottom: 8 },
});
