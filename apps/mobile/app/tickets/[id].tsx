import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Card, CardLabel } from '../../src/components/Card.js';
import { Chip } from '../../src/components/Chip.js';
import { Stepper, type StepperStep } from '../../src/components/Stepper.js';
import { getTicket, unvote, vote, type Ticket } from '../../src/lib/api.js';
import { COLORS, RADIUS, URGENCIA_LABEL } from '../../src/lib/colors.js';

const URGENCIA_CHIP: Record<string, 'crit' | 'med' | 'ok'> = {
  CRITICA: 'crit',
  ALTA: 'crit',
  MEDIA: 'med',
  BAJA: 'ok',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stepFromEstado(t: Ticket): { step: StepperStep; status: 'open' | 'discarded' } {
  if (t.estado === 'DESCARTADO') return { step: 1, status: 'discarded' };
  if (t.estado === 'SOLUCIONADO') return { step: 3, status: 'open' };
  if (t.estado === 'VALIDADO') return { step: 2, status: 'open' };
  return { step: 1, status: 'open' };
}

export default function TicketDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [t, setT] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setT(await getTicket(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function toggleVote() {
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const r = t.voted ? await unvote(t.id) : await vote(t.id);
      setT({ ...t, voted: !t.voted, votosCount: r.votosCount });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!t) {
    return (
      <View style={styles.wrap}>
        <View style={styles.loading}>
          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.muted}>Cargando…</Text>}
        </View>
      </View>
    );
  }

  // Las conductas NO se votan: son una denuncia entre vecinos, no un reclamo
  // colectivo que gane prioridad por apoyo (RF-F02 / P5). La API las rechaza con
  // 403, y acá se mostraba el botón igual: el denunciado veía "Sumar voto" sobre
  // la denuncia hecha en su contra y el único resultado posible era un error.
  const esConducta = t.tipo === 'CONDUCTA';
  const canVote = !esConducta && t.estado !== 'DESCARTADO' && t.estado !== 'SOLUCIONADO';
  const { step, status } = stepFromEstado(t);

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.blue700} />}
    >
      {/* Hero */}
      <Card>
        <View style={styles.chips}>
          <Chip
            label={
              t.tipo === 'CONDUCTA'
                ? 'Conducta'
                : t.origen === 'ESPACIO_COMUN'
                  ? 'Espacio común'
                  : 'Unidad'
            }
            variant={t.tipo === 'CONDUCTA' ? 'conduct' : 'blue'}
          />
          <Chip
            label={URGENCIA_LABEL[t.urgencia] ?? t.urgencia}
            variant={URGENCIA_CHIP[t.urgencia] ?? 'default'}
            dot
          />
          {t.estado === 'SOLUCIONADO' && <Chip label="Resuelto" variant="ok" />}
          {t.estado === 'DESCARTADO' && <Chip label="Descartado" variant="default" />}
        </View>
        <Text style={styles.title}>{t.titulo}</Text>
        <Text style={styles.desc}>{t.descripcionNormalizada}</Text>
        <Text style={styles.metaRow}>
          #{t.id.slice(0, 8)} · Creado {fmtDate(t.createdAt)}
        </Text>
      </Card>

      {/* Stepper */}
      <Card style={{ marginTop: 12 }}>
        <CardLabel>Estado del incidente</CardLabel>
        <Stepper current={step} status={status} />
      </Card>

      {/* Voto. En conducta la tarjeta entera no aplica: el contador siempre va a
          ser 0 y "vecinos afectados" no significa nada en una denuncia. */}
      {esConducta ? (
        <Card style={{ marginTop: 12 }}>
          <CardLabel>Reporte de conducta</CardLabel>
          <Text style={styles.desc}>
            Lo maneja la administración en privado. Quien lo reportó queda anónimo, y estos
            reportes no se votan.
          </Text>
        </Card>
      ) : (
      <Card style={{ marginTop: 12 }}>
        <View style={styles.voteRow}>
          <View>
            <CardLabel>Vecinos afectados</CardLabel>
            <Text style={styles.bigNumber}>{t.votosCount}</Text>
          </View>
          {canVote && (
            <Pressable
              style={({ pressed }) => [
                styles.voteBtn,
                t.voted && styles.voteBtnOn,
                (pressed || busy) && { opacity: 0.7 },
              ]}
              onPress={toggleVote}
              disabled={busy}
            >
              <Text style={[styles.voteText, t.voted && styles.voteTextOn]}>
                {t.voted ? '★ Sacar voto' : '＋ Sumar voto'}
              </Text>
            </Pressable>
          )}
        </View>
      </Card>
      )}

      {/* Costo del arreglo (RF-D05/E02/G10). `null` = no corresponde mostrarlo:
          es un ticket de otra unidad o una conducta. Lista vacía = todavía no se
          cargó ningún costo, y decirlo es mejor que no mostrar la sección: el
          vecino se pregunta cuánto salió. */}
      {t.costosConfirmados && (
        <Card style={{ marginTop: 12 }}>
          <CardLabel>Costo del arreglo</CardLabel>
          {t.costosConfirmados.length === 0 ? (
            <Text style={styles.desc}>
              La administración todavía no cargó el costo.
            </Text>
          ) : (
            t.costosConfirmados.map((c) => (
              <Meta
                key={c.moneda}
                k={c.moneda}
                v={c.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              />
            ))
          )}
        </Card>
      )}

      {/* Fechas */}
      <Card style={{ marginTop: 12 }}>
        <CardLabel>Línea de tiempo</CardLabel>
        <Meta k="Creado" v={fmtDate(t.createdAt)} />
        {t.validatedAt && <Meta k="Validado" v={fmtDate(t.validatedAt)} />}
        {t.solucionadoAt && <Meta k="Resuelto" v={fmtDate(t.solucionadoAt)} />}
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

function Meta({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaK}>{k}</Text>
      <Text style={styles.metaV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 14, paddingBottom: 40 },
  loading: { padding: 40, alignItems: 'center' },
  muted: { color: COLORS.ink3, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.2, lineHeight: 22 },
  desc: { fontSize: 14, color: COLORS.ink2, lineHeight: 20, marginTop: 6 },
  metaRow: { fontSize: 11, color: COLORS.ink3, marginTop: 12, fontFamily: 'Menlo' },
  voteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigNumber: { fontSize: 28, fontWeight: '700', color: COLORS.ink, marginTop: -2 },
  voteBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.base,
    borderColor: COLORS.blue700, borderWidth: 1, backgroundColor: COLORS.surface,
  },
  voteBtnOn: { backgroundColor: COLORS.blue700 },
  voteText: { color: COLORS.blue700, fontWeight: '600', fontSize: 13 },
  voteTextOn: { color: 'white' },
  meta: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomColor: COLORS.line2, borderBottomWidth: 1,
  },
  metaK: { fontSize: 12, color: COLORS.ink3 },
  metaV: { fontSize: 12.5, color: COLORS.ink },
  error: {
    color: COLORS.critical, backgroundColor: COLORS.criticalBg,
    padding: 10, borderRadius: 8, marginTop: 12, fontSize: 12.5,
  },
});
