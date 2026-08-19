import { useEffect, useState } from 'react';
import { Topbar } from '../components/Shell.js';
import {
  EVENTO_CONSORCIO_ACTIVO,
  getConsorcioActivo,
  getMetrics,
  listConsorcios,
  setConsorcioActivo,
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
  const [consorcioFilter, setConsorcioFilter] = useState<string>(getConsorcioActivo() ?? '');

  useEffect(() => {
    const sincronizar = () => setConsorcioFilter(getConsorcioActivo() ?? '');
    window.addEventListener(EVENTO_CONSORCIO_ACTIVO, sincronizar);
    return () => window.removeEventListener(EVENTO_CONSORCIO_ACTIVO, sincronizar);
  }, []);
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
      {/* "del tenant" era jerga del código: quien lee esto es la administradora. */}
      <Topbar title="Resumen" subtitle="Métricas operativas de tu administración" />
      <div className="content">
        <section className="stack">
          <div className="filters-bar" style={{ padding: '0 0 12px', borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="uppercase">Consorcio</span>
              <select value={consorcioFilter} onChange={(e) => setConsorcioActivo(e.target.value)} style={{ minWidth: 240, height: 32 }}>
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
                  <div className="kpi-delta">
                    {consorcioFilter ? 'en este consorcio' : 'en toda la administración'}
                  </div>
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

              {/* RF-C07: costo del clasificador. La API lo calculaba desde la
                  migración 0006 y no había ninguna pantalla que lo mostrara,
                  así que el dato con el que se decide si el precio del SaaS
                  cierra existía solo en la base. */}
              <div className="card">
                <div className="row-between" style={{ marginBottom: 12 }}>
                  <div className="uppercase">Costo de la IA</div>
                  <span className="muted small">
                    {data.costoIa.ticketsClasificados} ticket{data.costoIa.ticketsClasificados === 1 ? '' : 's'} clasificado{data.costoIa.ticketsClasificados === 1 ? '' : 's'}
                  </span>
                </div>
                {data.costoIa.ticketsClasificados === 0 ? (
                  <div className="muted small">
                    Todavía no se clasificó ningún ticket en este consorcio. Con el proveedor en
                    modo mock el costo es cero por definición.
                  </div>
                ) : (
                  <>
                    <div className="kpi-strip">
                      <div className="kpi">
                        <div className="kpi-label">Costo total</div>
                        <div className="kpi-value">US$ {data.costoIa.totalUsd.toFixed(4)}</div>
                        <div className="kpi-delta">acumulado</div>
                      </div>
                      <div className="kpi">
                        <div className="kpi-label">Por ticket</div>
                        <div className="kpi-value">US$ {data.costoIa.promedioPorTicketUsd.toFixed(6)}</div>
                        <div className="kpi-delta">promedio</div>
                      </div>
                      <div className="kpi">
                        <div className="kpi-label">Latencia mediana</div>
                        <div className="kpi-value">{data.costoIa.latenciaP50Ms} ms</div>
                        <div className="kpi-delta">p50 del clasificador</div>
                      </div>
                      <div className="kpi">
                        <div className="kpi-label">Corregidos por el admin</div>
                        <div className="kpi-value">{data.costoIa.corregidosPorAdmin}</div>
                        <div className="kpi-delta">
                          {data.costoIa.ticketsClasificados > 0
                            ? `${Math.round((data.costoIa.corregidosPorAdmin / data.costoIa.ticketsClasificados) * 100)}% de tasa de error`
                            : '—'}
                        </div>
                      </div>
                    </div>
                    <div className="muted small mt-3">
                      Tokens: <span className="mono">{data.costoIa.tokensIn.toLocaleString('es-AR')}</span> de entrada ·{' '}
                      <span className="mono">{data.costoIa.tokensOut.toLocaleString('es-AR')}</span> de salida. Cada
                      corrección del admin alimenta el dataset de evaluación del clasificador.
                    </div>
                  </>
                )}
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
