import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import {
  createGasto,
  getTicket,
  listGastos,
  totalGastos,
  transitionTicket,
  type Gasto,
  type Ticket,
  type TicketEstado,
  type TicketOrigen,
} from '../lib/api.js';

const ESTADO_LABEL: Record<TicketEstado, string> = {
  REGISTRADO: 'Recibido',
  VALIDADO: 'En curso',
  DESCARTADO: 'Descartado',
  SOLUCIONADO: 'Resuelto',
};

const URGENCIA_CLS: Record<string, string> = {
  CRITICA: 'crit',
  ALTA: 'crit',
  MEDIA: 'med',
  BAJA: 'ok',
};

const URGENCIA_LABEL: Record<string, string> = {
  CRITICA: 'Crítico',
  ALTA: 'Alto',
  MEDIA: 'Medio',
  BAJA: 'Bajo',
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TicketDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [totales, setTotales] = useState<Array<{ moneda: string; total: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showValidar, setShowValidar] = useState(false);
  const [origenChoice, setOrigenChoice] = useState<TicketOrigen>('ESPACIO_COMUN');
  const [nota, setNota] = useState('');
  const [showGasto, setShowGasto] = useState(false);
  const [gDesc, setGDesc] = useState('');
  const [gMonto, setGMonto] = useState('');
  const [gComprobante, setGComprobante] = useState('');

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [t, g, tot] = await Promise.all([getTicket(id), listGastos(id), totalGastos(id)]);
      setTicket(t);
      setGastos(g);
      setTotales(tot);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!id) return <div className="error">Sin id</div>;

  async function doTransition(to: TicketEstado, body: Record<string, string> = {}) {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Parameters<typeof transitionTicket>[1] = { to, ...(body as object) } as Parameters<typeof transitionTicket>[1];
      const next = await transitionTicket(ticket.id, payload);
      setTicket(next);
      setShowValidar(false);
      setNota('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateGasto(e: FormEvent) {
    e.preventDefault();
    if (!ticket) return;
    setBusy(true);
    setError(null);
    try {
      const monto = Number(gMonto);
      if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto inválido');
      await createGasto(ticket.id, {
        descripcion: gDesc,
        monto,
        moneda: 'ARS',
        ...(gComprobante && { comprobante_url: gComprobante }),
        estado: 'CONFIRMADO',
      });
      setGDesc('');
      setGMonto('');
      setGComprobante('');
      setShowGasto(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ticket) {
    return (
      <>
        <Topbar title="Cargando…" />
        <div className="content"><section><div className="muted">Cargando ticket…</div></section></div>
      </>
    );
  }

  const totalARS = totales.find((t) => t.moneda === 'ARS')?.total ?? 0;
  const tieneVisibilidad = ticket.origen !== null;

  return (
    <>
      <div className="topbar" style={{ padding: '14px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" className="btn ghost sm"><Icons.arrowLeft size={14} />Bandeja</Link>
          <span style={{ color: 'var(--cf-ink-3)', fontSize: 13 }}>/</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--cf-ink-3)' }}>#{ticket.id.slice(0, 8)}</span>
          <span style={{ color: 'var(--cf-ink-3)', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ticket.titulo}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost"><Icons.bell size={14} />Notificar vecinos</button>
        </div>
      </div>

      <div className="content">
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
          <div className="stack">
            {/* AI Decision Panel */}
            <div className="ai-panel">
              <div className="ai-panel-header">
                <div className="ai-panel-icon"><Icons.spark size={15} sw={2} /></div>
                <div style={{ flex: 1 }}>
                  <div className="ai-panel-title">Sugerencia de la IA</div>
                  <div style={{ fontSize: 11.5, color: 'var(--cf-ink-3)' }}>
                    Texto · {ticket.tipo === 'CONDUCTA' ? 'reporte de conducta' : 'reporte de infraestructura'}
                  </div>
                </div>
                <span className="chip blue"><span className="mono">85%</span> confianza</span>
              </div>
              <div className="ai-panel-body">
                <div className="ai-keyvals">
                  <div>
                    <div className="keyval-k">Categoría sugerida</div>
                    <div className={`keyval-v ${ticket.origen === 'ESPACIO_COMUN' ? 'common' : ''}`}>
                      {ticket.tipo === 'CONDUCTA'
                        ? 'Conducta'
                        : ticket.origen === 'ESPACIO_COMUN'
                          ? 'Espacio Común'
                          : ticket.origen === 'UNIDAD'
                            ? 'Unidad Privada'
                            : 'Sin validar'}
                    </div>
                  </div>
                  <div>
                    <div className="keyval-k">Urgencia</div>
                    <div className={`keyval-v ${URGENCIA_CLS[ticket.urgencia]}`}>
                      {URGENCIA_LABEL[ticket.urgencia]}
                    </div>
                  </div>
                  <div>
                    <div className="keyval-k">Estado actual</div>
                    <div className="keyval-v">{ESTADO_LABEL[ticket.estado]}</div>
                  </div>
                </div>
                <div className="ai-summary">
                  <b style={{ color: 'var(--cf-ink)' }}>Descripción:</b> {ticket.descripcionNormalizada}
                </div>

                {ticket.estado === 'REGISTRADO' && (
                  <div className="actions mt-4">
                    {!showValidar ? (
                      <>
                        <button type="button" className="btn primary" onClick={() => setShowValidar(true)} disabled={busy}>
                          <Icons.check size={14} sw={2.2} /> Validar y clasificar
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busy}
                          onClick={() => doTransition('DESCARTADO', nota ? { nota } : {})}
                        >
                          <Icons.trash size={14} /> Descartar
                        </button>
                      </>
                    ) : (
                      <div className="card tight" style={{ width: '100%' }}>
                        <div className="uppercase mt-2">Origen (afecta visibilidad)</div>
                        <div className="segment mt-2">
                          <button type="button" className={origenChoice === 'ESPACIO_COMUN' ? 'on' : ''} onClick={() => setOrigenChoice('ESPACIO_COMUN')}>Espacio común</button>
                          <button type="button" className={origenChoice === 'UNIDAD' ? 'on' : ''} onClick={() => setOrigenChoice('UNIDAD')}>Unidad</button>
                        </div>
                        <div className="mt-3">
                          <label>
                            <span>Nota interna</span>
                            <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional: contexto para el equipo" />
                          </label>
                        </div>
                        <div className="actions mt-3">
                          <button type="button" className="btn primary" disabled={busy} onClick={() => doTransition('VALIDADO', { origen: origenChoice, ...(nota && { nota }) })}>
                            Confirmar validación
                          </button>
                          <button type="button" className="btn ghost" disabled={busy} onClick={() => setShowValidar(false)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {ticket.estado === 'VALIDADO' && (
                  <div className="actions mt-4">
                    <button type="button" className="btn primary" disabled={busy} onClick={() => doTransition('SOLUCIONADO', nota ? { nota } : {})}>
                      <Icons.check size={14} sw={2.2} /> Marcar resuelto
                    </button>
                    <button type="button" className="btn danger" disabled={busy} onClick={() => doTransition('DESCARTADO', nota ? { nota } : {})}>
                      <Icons.trash size={14} /> Descartar
                    </button>
                  </div>
                )}

                {(ticket.estado === 'SOLUCIONADO' || ticket.estado === 'DESCARTADO') && (
                  <div className="mt-3 muted small">Ticket cerrado. Si vuelve a aparecer, creá uno nuevo.</div>
                )}
              </div>
            </div>

            {error && <div className="error">{error}</div>}

            {/* Reporte original */}
            <div className="card">
              <div className="row-between">
                <div style={{ fontSize: 13, fontWeight: 600 }}>Reporte original</div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cf-whatsapp-dk)', fontSize: 12, fontWeight: 600 }}>
                  <Icons.whatsapp size={14} fill="currentColor" stroke="currentColor" />
                  Recibido · {shortDate(ticket.createdAt)}
                </span>
              </div>
              <p className="mt-3" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--cf-ink-2)' }}>
                {ticket.descripcionNormalizada}
              </p>
            </div>

            {/* Gastos */}
            <div className="card">
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Costos del arreglo</div>
                {ticket.estado !== 'DESCARTADO' && (
                  <button type="button" className="btn ghost sm" onClick={() => setShowGasto((s) => !s)}>
                    <Icons.plus size={14} /> {showGasto ? 'Cancelar' : 'Cargar gasto'}
                  </button>
                )}
              </div>

              {totalARS > 0 && (
                <div className="chip ok mt-2" style={{ marginBottom: 12 }}>
                  Total ARS: <span className="mono">{totalARS.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              {showGasto && (
                <form className="form-grid card tight" onSubmit={onCreateGasto}>
                  <label>
                    <span>Descripción</span>
                    <input value={gDesc} onChange={(e) => setGDesc(e.target.value)} required maxLength={280} />
                  </label>
                  <label>
                    <span>Monto (ARS)</span>
                    <input type="number" step="0.01" min="0.01" value={gMonto} onChange={(e) => setGMonto(e.target.value)} required />
                  </label>
                  <label>
                    <span>URL del comprobante</span>
                    <input type="url" value={gComprobante} onChange={(e) => setGComprobante(e.target.value)} placeholder="https://…" />
                  </label>
                  <button type="submit" className="btn primary" disabled={busy || !gDesc || !gMonto}>Confirmar gasto</button>
                </form>
              )}

              {gastos.length === 0 ? (
                <div className="muted small mt-2">Sin gastos cargados.</div>
              ) : (
                <table className="grid mt-3">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Monto</th>
                      <th>Comprobante</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.map((g) => (
                      <tr key={g.id}>
                        <td>{g.descripcion}</td>
                        <td className="mono">{g.moneda} {Number(g.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        <td>{g.comprobanteUrl ? <a href={g.comprobanteUrl} target="_blank" rel="noreferrer">ver</a> : <span className="muted">—</span>}</td>
                        <td className="muted small">{new Date(g.createdAt).toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* SIDEBAR */}
          <aside className="stack">
            <div className="card">
              <div className="uppercase">Reportado por</div>
              <div className="mt-3" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="sidebar-user-avatar" style={{ width: 40, height: 40, fontSize: 13 }}>
                  {ticket.reportanteId ? ticket.reportanteId.slice(0, 2).toUpperCase() : '?'}
                </div>
                <div style={{ flex: 1, lineHeight: 1.2 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {ticket.tipo === 'CONDUCTA' ? 'Reportante anónimo' : 'Residente'}
                  </div>
                  <div className="muted small">
                    {ticket.tipo === 'CONDUCTA' ? 'Identidad oculta a terceros' : 'Vía bot WhatsApp / App'}
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="uppercase">Línea de tiempo</div>
              <div className="mt-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Step label="Recibido" sub={shortDate(ticket.createdAt)} done />
                <Step label="Validado" sub={ticket.validatedAt ? shortDate(ticket.validatedAt) : '—'} done={Boolean(ticket.validatedAt)} />
                <Step label="Resuelto" sub={ticket.solucionadoAt ? shortDate(ticket.solucionadoAt) : '—'} done={Boolean(ticket.solucionadoAt)} />
              </div>
            </div>

            <div className="card">
              <div className="row-between">
                <div className="uppercase">Vecinos afectados</div>
                <span className="mono" style={{ fontSize: 12 }}>{ticket.votosCount}</span>
              </div>
              <div className="muted small mt-2" style={{ lineHeight: 1.4 }}>
                {ticket.votosCount === 0
                  ? 'Aún sin votos. Si el ticket es de espacio común, los vecinos pueden sumar su voto desde la app.'
                  : `${ticket.votosCount} ${ticket.votosCount === 1 ? 'vecino sumó' : 'vecinos sumaron'} su voto. La prioridad en bandeja crece con cada voto.`}
              </div>
            </div>

            <div className="card">
              <div className="uppercase">Metadatos</div>
              <dl className="meta-list mt-3">
                <dt>Consorcio</dt>
                <dd className="mono small">{ticket.consorcioId.slice(0, 8)}</dd>
                <dt>Unidad</dt>
                <dd className="mono small">{ticket.unidadId ? ticket.unidadId.slice(0, 8) : 'común'}</dd>
                <dt>Visibilidad</dt>
                <dd>{!tieneVisibilidad ? 'Sin validar' : ticket.origen === 'ESPACIO_COMUN' ? 'Todos los vecinos' : 'Solo ocupantes'}</dd>
                <dt>Tipo</dt>
                <dd>{ticket.tipo === 'CONDUCTA' ? 'Conducta (anónimo)' : 'Infraestructura'}</dd>
              </dl>
            </div>
          </aside>
        </section>
      </div>
    </>
  );
}

function Step({ label, sub, done }: { label: string; sub: string; done: boolean }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          background: done ? 'var(--cf-blue-700)' : 'white',
          border: done ? 'none' : '1.5px solid var(--cf-line)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done && <Icons.check size={13} sw={2.4} />}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--cf-ink)' : 'var(--cf-ink-3)' }}>{label}</div>
        <div className="muted small" style={{ marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}
