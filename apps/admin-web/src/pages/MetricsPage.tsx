import { useEffect, useState } from 'react';
import { Topbar } from '../components/Shell.js';
import {
  getMetrics,
  listConsorcios,
  type Consorcio,
  type MetricsOverview,
  type TicketEstado,
  type TicketUrgencia,
} from '../lib/api.js';

const ESTADO_LABEL: Record<TicketEstado, string> = {
  REGISTRADO: 'Recibido',
  VALIDADO: 'En curso',
  DESCARTADO: 'Descartado',
  SOLUCIONADO: 'Resuelto',
};

const URGENCIA_LABEL: Record<TicketUrgencia, string> = {
  CRITICA: 'Crítico',
  ALTA: 'Alto',
  MEDIA: 'Medio',
  BAJA: 'Bajo',
};

const URGENCIA_CHIP: Record<TicketUrgencia, string> = {
  CRITICA: 'crit',
  ALTA: 'crit',
  MEDIA: 'med',
  BAJA: 'ok',
};

const ESTADO_CHIP: Record<TicketEstado, string> = {
  REGISTRADO: 'blue',
  VALIDADO: 'med',
  SOLUCIONADO: 'ok',
  DESCARTADO: '',
};

export function MetricsPage(): JSX.Element {
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [consorcioFilter, setConsorcioFilter] = useState<string>('');
  const [data, setData] = useState<MetricsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listConsorcios().then(setConsorcios).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMetrics(consorcioFilter || undefined)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [consorcioFilter]);

  const avgMin = data?.avgResolutionMinutes;
  const avgMinNum = typeof avgMin === 'number' || typeof avgMin === 'string'
    ? Number(avgMin)
    : null;
  const ttrLabel = avgMinNum !== null && Number.isFinite(avgMinNum)
    ? avgMinNum < 60
      ? `${avgMinNum.toFixed(0)} min`
      : avgMinNum < 24 * 60
        ? `${(avgMinNum / 60).toFixed(1)} h`
        : `${(avgMinNum / (60 * 24)).toFixed(1)} d`
    : '—';

  const totalARS = data?.costosConfirmados.find((c) => c.moneda === 'ARS')?.total ?? 0;
  const totalTickets = data?.byEstado.reduce((s, r) => s + r.count, 0) ?? 0;

  return (
    <>
      <Topbar title="Resumen" subtitle="Métricas operativas del tenant" />
      <div className="content">
        <section className="stack">
          <div className="filters-bar" style={{ padding: '0 0 12px', borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="uppercase">Consorcio</span>
              <select value={consorcioFilter} onChange={(e) => setConsorcioFilter(e.target.value)} style={{ minWidth: 240, height: 32 }}>
                <option value="">Todos</option>
                {consorcios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          {loading && <div className="muted">Cargando…</div>}
          {data && (
            <>
              <div className="kpi-strip">
                <div className="kpi">
                  <div className="kpi-label">Tickets totales</div>
                  <div className="kpi-value">{totalTickets}</div>
                  <div className="kpi-delta">en este consorcio</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Tiempo medio resol.</div>
                  <div className="kpi-value">{ttrLabel}</div>
                  <div className="kpi-delta ok">solo SOLUCIONADO</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Costos confirmados</div>
                  <div className="kpi-value">${totalARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                  <div className="kpi-delta">acumulado ARS</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Estados activos</div>
                  <div className="kpi-value">{data.byEstado.filter((r) => r.estado === 'REGISTRADO' || r.estado === 'VALIDADO').reduce((s, r) => s + r.count, 0)}</div>
                  <div className="kpi-delta">aún abiertos</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="card">
                  <div className="uppercase" style={{ marginBottom: 12 }}>Tickets por estado</div>
                  {data.byEstado.length === 0 ? (
                    <div className="muted small">Sin tickets.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {data.byEstado.map((r) => {
                        const e = r.estado as TicketEstado;
                        const max = Math.max(...data.byEstado.map((x) => x.count));
                        const pct = max > 0 ? (r.count / max) * 100 : 0;
                        return (
                          <div key={r.estado}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                              <span className={`chip ${ESTADO_CHIP[e]}`}>{ESTADO_LABEL[e]}</span>
                              <span className="mono">{r.count}</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--cf-line-2)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--cf-blue-700)' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="uppercase" style={{ marginBottom: 12 }}>Tickets por urgencia</div>
                  {data.byUrgencia.length === 0 ? (
                    <div className="muted small">Sin tickets.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {data.byUrgencia.map((r) => {
                        const u = r.urgencia as TicketUrgencia;
                        const max = Math.max(...data.byUrgencia.map((x) => x.count));
                        const pct = max > 0 ? (r.count / max) * 100 : 0;
                        return (
                          <div key={r.urgencia}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                              <span className={`chip ${URGENCIA_CHIP[u]}`}><span className="dot" />{URGENCIA_LABEL[u]}</span>
                              <span className="mono">{r.count}</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--cf-line-2)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: u === 'CRITICA' || u === 'ALTA' ? 'var(--cf-critical)' : u === 'MEDIA' ? 'var(--cf-medium)' : 'var(--cf-resolved)' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="uppercase" style={{ marginBottom: 12 }}>Gastos confirmados</div>
                {data.costosConfirmados.length === 0 ? (
                  <div className="muted small">Sin gastos cargados.</div>
                ) : (
                  <table className="grid">
                    <thead>
                      <tr><th>Moneda</th><th style={{ width: 200 }}>Total</th></tr>
                    </thead>
                    <tbody>
                      {data.costosConfirmados.map((c) => (
                        <tr key={c.moneda}>
                          <td><strong>{c.moneda}</strong></td>
                          <td className="mono">{c.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
