import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card, CardLabel } from '../../src/components/Card.js';
import { MobileHeader } from '../../src/components/Header.js';
import { createTicket, misVinculos, type Vinculo } from '../../src/lib/api.js';
import { COLORS, RADIUS } from '../../src/lib/colors.js';
import { descartar, enqueue, readQueue, syncQueue, type PendingReport } from '../../src/lib/offline-queue.js';

function uuid(): string {
  const rand = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${rand()}${rand()}-${rand()}-4${rand().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${rand().slice(1)}-${rand()}${rand()}${rand()}`;
}

export default function NuevoScreen(): JSX.Element {
  const router = useRouter();
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [consorcioId, setConsorcioId] = useState<string>('');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<'INFRAESTRUCTURA' | 'CONDUCTA'>('INFRAESTRUCTURA');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingReport[]>([]);

  // La pantalla prometía "se enviará cuando vuelva la red" y no había nada que
  // lo hiciera: `syncQueue` solo corría si el vecino apretaba el botón. Ahora se
  // intenta al abrir la pantalla y cada vez que la app vuelve al frente, que es
  // cuando en la práctica se recuperó la señal. Se hace con `AppState`, que ya
  // viene en react-native, en vez de sumar netinfo como dependencia: escuchar la
  // conectividad de verdad es mejor, pero no puedo probarlo sin un dispositivo y
  // prefiero algo que sé que funciona a algo que parece funcionar.
  const [sincronizando, setSincronizando] = useState(false);

  const sincronizar = useCallback(async (silencioso: boolean) => {
    const cola = await readQueue();
    const hayQueIntentar = cola.some((i) => !i.rechazadoDefinitivamente);
    if (!hayQueIntentar) {
      setPending(cola);
      if (!silencioso) setInfo('No hay nada pendiente de enviar.');
      return;
    }
    setSincronizando(true);
    try {
      const r = await syncQueue();
      setPending(await readQueue());
      if (!silencioso || r.enviados > 0) {
        setInfo(
          r.enviados > 0
            ? `Se enviaron ${r.enviados} reporte${r.enviados === 1 ? '' : 's'}.` +
                (r.pendientes > 0 ? ` Quedan ${r.pendientes}.` : '')
            : `No se pudo enviar todavía. Quedan ${r.pendientes} en espera.`,
        );
      }
    } catch (e) {
      if (!silencioso) setError((e as Error).message);
    } finally {
      setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    void sincronizar(true);
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizar(true);
    });
    return () => sub.remove();
  }, [sincronizar]);

  async function onDescartar(id: string) {
    await descartar(id);
    setPending(await readQueue());
  }

  useEffect(() => {
    misVinculos()
      .then((list) => {
        setVinculos(list);
        if (list[0]) setConsorcioId(list[0].consorcioId);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const consorcios = useMemo(() => {
    const byId = new Map(vinculos.map((v) => [v.consorcioId, v.consorcioNombre]));
    return Array.from(byId, ([id, nombre]) => ({ id, nombre }));
  }, [vinculos]);

  // Un residente puede tener más de una unidad en el mismo consorcio (poco
  // común, pero el modelo lo permite); se usa la primera. El origen
  // (UNIDAD vs ESPACIO_COMUN) lo termina de resolver el admin al validar.
  const unidadSeleccionada = useMemo(
    () => vinculos.find((v) => v.consorcioId === consorcioId) ?? null,
    [vinculos, consorcioId],
  );

  const enEspera = useMemo(() => pending.filter((p) => !p.rechazadoDefinitivamente), [pending]);
  const rechazados = useMemo(() => pending.filter((p) => p.rechazadoDefinitivamente), [pending]);

  async function onSubmit() {
    if (!consorcioId || !titulo.trim() || !descripcion.trim()) {
      setError('Completá los campos.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const body = {
      consorcio_id: consorcioId,
      unidad_id: unidadSeleccionada?.unidadId ?? null,
      tipo,
      titulo: titulo.trim().slice(0, 140),
      descripcion: descripcion.trim(),
      client_generated_id: uuid(),
    };
    try {
      const r = await createTicket(body);
      setTitulo('');
      setDescripcion('');
      router.replace(`/tickets/${r.id}`);
    } catch (e) {
      // Offline / network error: encolar local (RF-E05).
      const msg = (e as Error).message;
      const isNetwork = /network|failed to fetch|abort|timeout/i.test(msg);
      if (isNetwork) {
        await enqueue(body);
        setPending(await readQueue());
        setTitulo('');
        setDescripcion('');
        setInfo('Sin conexión. Reporte guardado localmente. Se enviará cuando vuelva la red.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <MobileHeader title="Reportar" subtitle="Contale a tu admin qué pasó" />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* AI hint */}
        <Card style={styles.aiBanner}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}>
              <Text style={styles.aiIconText}>★</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiTag}>LA IA TE AYUDA</Text>
              <Text style={styles.aiText}>
                Mientras escribís, la IA pre-clasifica tu reporte. El admin lo valida después.
              </Text>
            </View>
          </View>
        </Card>

        {/* Tipo segmented */}
        <CardLabel>Tipo de reporte</CardLabel>
        <View style={styles.row}>
          {(
            [
              { k: 'INFRAESTRUCTURA' as const, label: 'Infraestructura', sub: 'Algo roto / mal' },
              { k: 'CONDUCTA' as const, label: 'Conducta', sub: 'Anónimo a terceros' },
            ]
          ).map((opt) => (
            <Pressable
              key={opt.k}
              style={[styles.bigChip, tipo === opt.k && styles.bigChipOn]}
              onPress={() => setTipo(opt.k)}
            >
              <Text style={[styles.bigChipTitle, tipo === opt.k && styles.bigChipTitleOn]}>
                {opt.label}
              </Text>
              <Text style={[styles.bigChipSub, tipo === opt.k && styles.bigChipSubOn]}>
                {opt.sub}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Consorcio selector si > 1 */}
        {consorcios.length > 1 && (
          <>
            <CardLabel>Consorcio</CardLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.consChips}>
              {consorcios.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.consChip, consorcioId === c.id && styles.consChipOn]}
                  onPress={() => setConsorcioId(c.id)}
                >
                  <Text style={[styles.consChipText, consorcioId === c.id && styles.consChipTextOn]}>
                    {c.nombre}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {unidadSeleccionada && (
          <Text style={styles.unidadHint}>
            Reportás como {unidadSeleccionada.rol === 'PROPIETARIO' ? 'propietario/a' : 'inquilino/a'} de la unidad {unidadSeleccionada.unidadEtiqueta}.
          </Text>
        )}

        <CardLabel>Título</CardLabel>
        <TextInput
          style={styles.input}
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Ej. Pérdida de agua en palier"
          placeholderTextColor={COLORS.ink4}
          maxLength={140}
        />

        <CardLabel>Descripción</CardLabel>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Contá qué pasó, cuándo lo notaste, si hay alguien afectado…"
          placeholderTextColor={COLORS.ink4}
          multiline
          numberOfLines={5}
        />

        {tipo === 'CONDUCTA' && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Los reportes de conducta son anónimos frente a terceros. Solo el administrador ve quién reporta.
            </Text>
          </View>
        )}

        {enEspera.length > 0 && (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingTitle}>
              {enEspera.length} reporte{enEspera.length === 1 ? '' : 's'} esperando conexión. Se
              {enEspera.length === 1 ? ' va' : ' van'} a enviar solo{enEspera.length === 1 ? '' : 's'}.
            </Text>
            <Pressable
              onPress={() => void sincronizar(false)}
              disabled={sincronizando}
              style={({ pressed }) => [styles.syncBtn, (pressed || sincronizando) && { opacity: 0.7 }]}
            >
              <Text style={styles.syncBtnText}>{sincronizando ? 'Enviando…' : 'Enviar ahora'}</Text>
            </Pressable>
          </View>
        )}

        {/* Rechazados: no se reintentan más y no se borran solos. El vecino
            escribió ese texto; que desaparezca sin decirle nada es peor. */}
        {rechazados.map((r) => (
          <View key={r.id} style={styles.rejectedBox}>
            <Text style={styles.rejectedTitle}>No se pudo registrar “{r.body.titulo}”</Text>
            <Text style={styles.rejectedReason}>{r.lastError ?? 'La administración lo rechazó.'}</Text>
            <Pressable onPress={() => void onDescartar(r.id)} style={({ pressed }) => [styles.discardBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.discardText}>Descartar</Text>
            </Pressable>
          </View>
        ))}

        {info && <Text style={styles.info}>{info}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
          onPress={onSubmit}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? 'Enviando…' : 'Enviar reporte'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 18, paddingBottom: 100, gap: 6 },
  aiBanner: { backgroundColor: COLORS.blue50, borderColor: '#cbd9f1', marginBottom: 10 },
  aiHeader: { flexDirection: 'row', gap: 11 },
  aiIcon: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.blue700,
    alignItems: 'center', justifyContent: 'center',
  },
  aiIconText: { color: 'white', fontSize: 16, fontWeight: '700' },
  aiTag: { fontSize: 11, color: COLORS.blue700, fontWeight: '700', letterSpacing: 0.4 },
  aiText: { fontSize: 13.5, color: COLORS.ink2, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  bigChip: {
    flex: 1, padding: 14, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line, borderWidth: 1.5,
  },
  bigChipOn: { backgroundColor: COLORS.blue50, borderColor: COLORS.blue700 },
  bigChipTitle: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  bigChipTitleOn: { color: COLORS.blue700 },
  bigChipSub: { fontSize: 11, color: COLORS.ink3, marginTop: 3 },
  bigChipSubOn: { color: COLORS.blue700, opacity: 0.8 },
  consChips: { gap: 8, paddingBottom: 4 },
  consChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: COLORS.surface, borderColor: COLORS.line, borderWidth: 1,
  },
  consChipOn: { backgroundColor: COLORS.blue700, borderColor: COLORS.blue700 },
  consChipText: { fontSize: 12, color: COLORS.ink, fontFamily: 'Menlo' },
  consChipTextOn: { color: 'white' },
  unidadHint: { fontSize: 12, color: COLORS.ink3, marginTop: 2, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line, borderWidth: 1, borderRadius: RADIUS.base,
    paddingHorizontal: 14, height: 44, fontSize: 15, color: COLORS.ink,
    marginBottom: 4,
  },
  textarea: { minHeight: 120, height: undefined, paddingTop: 12, textAlignVertical: 'top' },
  notice: {
    backgroundColor: COLORS.mediumBg,
    borderColor: '#fed7aa', borderWidth: 1,
    padding: 12, borderRadius: 10, marginTop: 6,
  },
  noticeText: { color: '#92400e', fontSize: 12.5, lineHeight: 17 },
  error: {
    color: COLORS.critical, backgroundColor: COLORS.criticalBg,
    padding: 10, borderRadius: 8, marginTop: 8, fontSize: 12.5,
  },
  info: {
    color: COLORS.blue700, backgroundColor: COLORS.blue50,
    padding: 10, borderRadius: 8, marginTop: 8, fontSize: 12.5,
  },
  pendingBox: {
    backgroundColor: COLORS.mediumBg, borderColor: '#fed7aa', borderWidth: 1,
    padding: 12, borderRadius: 10, marginTop: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  pendingTitle: { flex: 1, color: '#92400e', fontSize: 12.5, fontWeight: '600' },
  syncBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: COLORS.blue700,
  },
  syncBtnText: { color: 'white', fontWeight: '600', fontSize: 12 },
  rejectedBox: {
    backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1,
    padding: 12, borderRadius: 10, marginTop: 10,
  },
  rejectedTitle: { color: '#991b1b', fontSize: 12.5, fontWeight: '700' },
  rejectedReason: { color: '#b91c1c', fontSize: 12, marginTop: 3 },
  discardBtn: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' },
  discardText: { color: '#991b1b', fontWeight: '600', fontSize: 12 },
  button: {
    backgroundColor: COLORS.blue700, paddingVertical: 14,
    borderRadius: RADIUS.base, alignItems: 'center', marginTop: 16,
  },
  buttonPressed: { backgroundColor: COLORS.blue800 },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 15 },
});
