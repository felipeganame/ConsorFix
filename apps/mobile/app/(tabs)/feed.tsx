import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Chip } from '../../src/components/Chip.js';
import { MobileHeader } from '../../src/components/Header.js';
import { listFeed, misVinculos, type FeedTicket, type Vinculo } from '../../src/lib/api.js';
import {
  COLORS,
  ESTADO_LABEL,
  RADIUS,
  URGENCIA_LABEL,
} from '../../src/lib/colors.js';

const ROL_LABEL: Record<Vinculo['rol'], string> = {
  PROPIETARIO: 'Propietario/a',
  INQUILINO: 'Inquilino/a',
};

function VinculosBanner({ vinculos }: { vinculos: Vinculo[] }): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || vinculos.length === 0) return null;
  return (
    <View style={styles.vinculosBanner}>
      <Pressable style={styles.vinculosClose} onPress={() => setDismissed(true)} hitSlop={10}>
        <Text style={styles.vinculosCloseText}>✕</Text>
      </Pressable>
      <Text style={styles.vinculosTitle}>Tu condición en cada consorcio</Text>
      {vinculos.map((v) => (
        <Text key={v.vinculoId} style={styles.vinculosLine}>
          Sos <Text style={styles.vinculosBold}>{ROL_LABEL[v.rol]}</Text> de la unidad{' '}
          <Text style={styles.vinculosBold}>{v.unidadEtiqueta}</Text> en {v.consorcioNombre}
        </Text>
      ))}
    </View>
  );
}

const FILTERS: Array<{ key: 'all' | 'COMUN' | 'CONDUCTA'; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'COMUN', label: 'Espacios comunes' },
  { key: 'CONDUCTA', label: 'Conducta' },
];

const URGENCIA_CHIP: Record<string, 'crit' | 'med' | 'ok'> = {
  CRITICA: 'crit',
  ALTA: 'crit',
  MEDIA: 'med',
  BAJA: 'ok',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return 'ayer';
  return `hace ${days} d`;
}

export default function FeedScreen(): JSX.Element {
  const router = useRouter();
  const [tickets, setTickets] = useState<FeedTicket[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'COMUN' | 'CONDUCTA'>('all');

  useEffect(() => {
    misVinculos().then(setVinculos).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await listFeed());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visible = useMemo(() => {
    if (filter === 'all') return tickets;
    if (filter === 'CONDUCTA') return tickets.filter((t) => t.tipo === 'CONDUCTA');
    return tickets.filter((t) => t.tipo === 'INFRAESTRUCTURA' && t.origen === 'ESPACIO_COMUN');
  }, [filter, tickets]);

  return (
    <View style={styles.wrap}>
      <MobileHeader title="Comunidad" subtitle="Lo que pasa en tu edificio" />

      <VinculosBanner vinculos={vinculos} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipOn]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextOn]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={visible}
        keyExtractor={(t) => t.id}
        contentContainerStyle={visible.length === 0 ? { flex: 1 } : { padding: 14, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.blue700} />}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sin reportes visibles todavía</Text>
              <Text style={styles.emptySub}>Usá la pestaña Reportar para crear el primero.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            onPress={() => router.push(`/tickets/${item.id}`)}
          >
            <View style={styles.cardChips}>
              <Chip
                label={
                  item.tipo === 'CONDUCTA'
                    ? 'Conducta'
                    : item.origen === 'ESPACIO_COMUN'
                      ? 'Espacio común'
                      : 'Unidad'
                }
                variant={item.tipo === 'CONDUCTA' ? 'conduct' : 'blue'}
              />
              <Chip
                label={URGENCIA_LABEL[item.urgencia] ?? item.urgencia}
                variant={URGENCIA_CHIP[item.urgencia] ?? 'default'}
                dot
              />
              {item.voted && <Chip label="★ Votado" variant="ok" />}
            </View>
            <Text style={styles.cardTitle}>{item.titulo}</Text>
            <Text style={styles.cardDesc} numberOfLines={2}>{item.descripcionNormalizada}</Text>
            {/* RF-D05/E02/G10: el costo confirmado del arreglo. Es la propuesta
                de valor del producto —el vecino ve en qué se gastó la plata— y
                la app no lo mostraba en ninguna pantalla. `null` significa que
                no corresponde verlo (unidad ajena o conducta), así que no se
                renderiza nada; una lista vacía es "visible, sin costo todavía". */}
            {item.costosConfirmados && item.costosConfirmados.length > 0 && (
              <View style={styles.costos}>
                {item.costosConfirmados.map((c) => (
                  <Text key={c.moneda} style={styles.costoText}>
                    Costo del arreglo: {c.moneda} {c.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </Text>
                ))}
              </View>
            )}
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>
                {ESTADO_LABEL[item.estado]} · {relativeTime(item.createdAt)}
              </Text>
              <View style={styles.votes}>
                <Text style={styles.votesText}>{item.votosCount}</Text>
                <Text style={styles.votesLabel}>{item.votosCount === 1 ? 'voto' : 'votos'}</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg },
  vinculosBanner: {
    marginHorizontal: 14, marginTop: 8, padding: 12, paddingRight: 30,
    backgroundColor: COLORS.blue50, borderColor: '#cbd9f1', borderWidth: 1,
    borderRadius: RADIUS.lg, gap: 3,
  },
  vinculosClose: { position: 'absolute', top: 8, right: 10, padding: 4 },
  vinculosCloseText: { color: COLORS.ink3, fontSize: 13 },
  vinculosTitle: { fontSize: 11.5, fontWeight: '700', color: COLORS.blue700, letterSpacing: 0.3, marginBottom: 2 },
  vinculosLine: { fontSize: 12.5, color: COLORS.ink2, lineHeight: 17 },
  vinculosBold: { fontWeight: '700', color: COLORS.ink },
  filters: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: COLORS.surface, borderColor: COLORS.line, borderWidth: 1,
  },
  filterChipOn: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  filterText: { fontSize: 12.5, color: COLORS.ink2, fontWeight: '600' },
  filterTextOn: { color: 'white' },
  error: {
    color: COLORS.critical, backgroundColor: COLORS.criticalBg,
    padding: 10, marginHorizontal: 14, marginTop: 10, borderRadius: 8, fontSize: 12.5,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.ink, marginBottom: 4 },
  emptySub: { fontSize: 13, color: COLORS.ink3, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.surface, borderColor: COLORS.line, borderWidth: 1,
    borderRadius: RADIUS.lg, padding: 14, marginBottom: 10, gap: 8,
  },
  cardChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardTitle: { fontSize: 15.5, fontWeight: '600', color: COLORS.ink, letterSpacing: -0.2 },
  cardDesc: { color: COLORS.ink3, fontSize: 13, lineHeight: 18 },
  costos: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginBottom: 8,
  },
  costoText: { color: COLORS.ink2, fontSize: 12.5, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMeta: { color: COLORS.ink3, fontSize: 11.5 },
  votes: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  votesText: { color: COLORS.blue700, fontSize: 16, fontWeight: '700' },
  votesLabel: { color: COLORS.ink3, fontSize: 11 },
});
