import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import {
  getMetrics,
  listConsorcios,
  listTickets,
  type Consorcio,
  type MetricsOverview,
  type Ticket,
  type TicketEstado,
  type TicketUrgencia,
} from '../lib/api.js';

const URGENCIA_RANK: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };

const URGENCIA_CHIP: Record<TicketUrgencia, { cls: string; label: string }> = {
  CRITICA: { cls: 'crit', label: 'Crítico' },
  ALTA: { cls: 'crit', label: 'Alto' },
  MEDIA: { cls: 'med', label: 'Medio' },
  BAJA: { cls: 'ok', label: 'Bajo' },
};

const URGENCIA_BAR: Record<TicketUrgencia, string> = {
  CRITICA: 'crit',
  ALTA: 'crit',
  MEDIA: 'med',
  BAJA: 'ok',
};

const ESTADO_LABEL: Record<TicketEstado, string> = {
  REGISTRADO: 'Recibido',
  VALIDADO: 'En curso',
  DESCARTADO: 'Descartado',
  SOLUCIONADO: 'Resuelto',
};

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString('es-AR');
}

export function BandejaPage(): JSX.Element {
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [consorcioFilter, setConsorcioFilter] = useState<string>('');
  const [estadoFilter, setEstadoFilter] = useState<TicketEstado | ''>('REGISTRADO');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [metrics, setMetrics] = useState<MetricsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listConsorcios().then(setConsorcios).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      listTickets({
        ...(consorcioFilter && { consorcio_id: consorcioFilter }),
        ...(estadoFilter && { estado: estadoFilter as TicketEstado }),
      }),
      getMetrics(consorcioFilter || undefined),
    ])
      .then(([t, m]) => {
        setTickets(t);
        setMetrics(m);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [consorcioFilter, estadoFilter]);

  const sorted = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const ua = URGENCIA_RANK[a.urgencia] ?? 99;
      const ub = URGENCIA_RANK[b.urgencia] ?? 99;
      if (ua !== ub) return ua - ub;
      if (a.votosCount !== b.votosCount) return b.votosCount - a.votosCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tickets]);

  const countByEstado = useMemo(() => {
    const m: Record<string, number> = {};
    if (metrics) for (const r of metrics.byEstado) m[r.estado] = r.count;
    return m;
  }, [metrics]);

  const sinTriar = countByEstado.REGISTRADO ?? 0;
  const criticos = (metrics?.byUrgencia.find((u) => u.urgencia === 'CRITICA')?.count ?? 0)
    + (metrics?.byUrgencia.find((u) => u.urgencia === 'ALTA')?.count ?? 0);
  const ttrMin = typeof metrics?.avgResolutionMinutes === 'number'
    || typeof metrics?.avgResolutionMinutes === 'string'
    ? Number(metrics.avgResolutionMinutes)
    : null;
  const ttrLabel = ttrMin !== null && Number.isFinite(ttrMin)
    ? ttrMin < 60
      ? `${ttrMin.toFixed(0)} min`
      : ttrMin < 24 * 60
        ? `${(ttrMin / 60).toFixed(1)} h`
        : `${(ttrMin / (60 * 24)).toFixed(1)} d`
    : '—';
  const gastoARS = metrics?.costosConfirmados.find((c) => c.moneda === 'ARS')?.total ?? 0;

  return (
    <>
      <Topbar
        title="Bandeja de entrada"
        subtitle={`${sinTriar} sin triar · IA pre-clasifica cada nuevo reporte`}
        actions={
          <>
            <button type="button" className="btn ghost"><Icons.filter size={14} />Exportar</button>
            <button type="button" className="btn primary"><Icons.plus size={14} sw={2.2} />Nuevo reporte</button>
          </>
        }
      />

      <div className="content">
        <section style={{ paddingBottom: 0 }}>
          <div className="kpi-strip">
            <div className="kpi">
              <div className="kpi-label">Sin triar</div>
              <div className="kpi-value">{sinTriar}</div>
              <div className="kpi-delta">en este consorcio</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Alta urgencia</div>
              <div className="kpi-value">{criticos}</div>
              <div className="kpi-delta crit">requieren atención</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Tiempo medio resol.</div>
              <div className="kpi-value">{ttrLabel}</div>
              <div className="kpi-delta ok">métrica del tenant</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Gastos confirmados</div>
              <div className="kpi-value">${gastoARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
              <div className="kpi-delta">acumulado ARS</div>
            </div>
          </div>
        </section>

        <div className="filters-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="uppercase">Consorcio</span>
            <select value={consorcioFilter} onChange={(e) => setConsorcioFilter(e.target.value)} style={{ minWidth: 200, height: 32 }}>
              <option value="">Todos</option>
              {consorcios.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="filter-divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="uppercase">Estado</span>
            <div className="segment">
              {(['REGISTRADO', 'VALIDADO', 'SOLUCIONADO', 'DESCARTADO', ''] as const).map((s) => (
                <button
                  key={s || 'all'}
                  className={estadoFilter === s ? 'on' : ''}
                  onClick={() => setEstadoFilter(s as TicketEstado | '')}
                  type="button"
                >
                  {s ? ESTADO_LABEL[s as TicketEstado] : 'Todos'}
                </button>
              ))}
            </div>
          </div>
          <div className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--cf-ink-3)' }}>{sorted.length} resultados</span>
        </div>

        <div className="inbox-row-head">
          <span />
          <span>Incidente</span>
          <span>Origen</span>
          <span>Urgencia</span>
          <span>Estado</span>
          <span>Votos</span>
          <span />
        </div>

        {error && <div className="error" style={{ margin: '12px 28px' }}>{error}</div>}
        {loading && <div className="muted" style={{ padding: '16px 28px' }}>Cargando…</div>}
        {!loading && sorted.length === 0 && (
          <div className="muted center" style={{ padding: '40px 28px' }}>
            Sin tickets para los filtros aplicados.
          </div>
        )}

        {sorted.map((t) => {
          const u = URGENCIA_CHIP[t.urgencia];
          const barCls = URGENCIA_BAR[t.urgencia];
          return (
            <Link to={`/tickets/${t.id}`} key={t.id} className="inbox-row" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className={`inbox-bar ${barCls}`} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--cf-ink-3)' }}>#{t.id.slice(0, 8)}</span>
                </div>
                <div className="inbox-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.titulo}
                </div>
                <div className="inbox-meta">
                  {t.tipo === 'CONDUCTA' ? 'Conducta' : t.origen === 'ESPACIO_COMUN' ? 'Espacio común' : 'Unidad'} · {relativeTime(t.createdAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--cf-ink-2)' }}>
                <Icons.whatsapp size={14} stroke="var(--cf-whatsapp-dk)" fill="var(--cf-whatsapp-dk)" />
                <span>Bot / App</span>
              </div>
              <div>
                <span className={`chip ${u.cls}`}>
                  <span className="dot" />
                  {u.label}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--cf-ink-2)' }}>{ESTADO_LABEL[t.estado]}</div>
              <div className="mono" style={{ fontSize: 12 }}>{t.votosCount}</div>
              <Icons.chev size={14} stroke="var(--cf-ink-4)" />
            </Link>
          );
        })}
      </div>
    </>
  );
}
