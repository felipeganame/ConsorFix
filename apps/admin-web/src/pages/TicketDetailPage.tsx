import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import {
  createGasto,
  createRegistroConducta,
  getConsorcio,
  getHistorial,
  historialConducta,
  getTicket,
  listCategorias,
  listGastos,
  listRegistrosConducta,
  listUnidades,
  totalGastos,
  transitionTicket,
  type Categoria,
  type Consorcio,
  type EventoConvivencia,
  type RegistroConducta,
  type ResultadoConducta,
  type Gasto,
  type HistorialEvento,
  type Ticket,
  type TicketEstado,
  type TicketOrigen,
  type Unidad,
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
  const [historial, setHistorial] = useState<HistorialEvento[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  // El nombre del consorcio: Metadatos mostraba el UUID recortado, que no le
  // dice nada a nadie. La unidad ya se resolvía a su etiqueta.
  const [cons, setCons] = useState<Consorcio | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showValidar, setShowValidar] = useState(false);
  const [origenChoice, setOrigenChoice] = useState<TicketOrigen>('ESPACIO_COMUN');
  const [unidadReportada, setUnidadReportada] = useState('');
  const [categoriaChoice, setCategoriaChoice] = useState('');
  const [nota, setNota] = useState('');
  const [showGasto, setShowGasto] = useState(false);
  const [gDesc, setGDesc] = useState('');
  const [gMonto, setGMonto] = useState('');
  const [gComprobante, setGComprobante] = useState('');
  const [gEstado, setGEstado] = useState<'BORRADOR' | 'CONFIRMADO'>('CONFIRMADO');

  // Convivencia (RF-F03): avisos y sanciones del reporte, y el historial de la
  // unidad señalada. Los endpoints existían y no había ninguna pantalla, así que
  // el circuito de conducta terminaba en "validado" y no se podía cerrar.
  const [registros, setRegistros] = useState<RegistroConducta[]>([]);
  const [convivencia, setConvivencia] = useState<EventoConvivencia[]>([]);
  const [rcResultado, setRcResultado] = useState<ResultadoConducta>('AVISO');
  const [rcDetalle, setRcDetalle] = useState('');

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [t, g, tot, hist] = await Promise.all([
        getTicket(id),
        listGastos(id),
        totalGastos(id),
        getHistorial(id),
      ]);
      setTicket(t);
      setGastos(g);
      setTotales(tot);
      setHistorial(hist);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshConducta = useCallback(async () => {
    if (!id || !ticket || ticket.tipo !== 'CONDUCTA') return;
    try {
      const regs = await listRegistrosConducta(id);
      setRegistros(regs);
      // El historial es de la unidad señalada; sin ella todavía no hay a quién
      // mirarle los antecedentes.
      if (ticket.unidadReportadaId) {
        setConvivencia(await historialConducta(ticket.unidadReportadaId));
      } else {
        setConvivencia([]);
      }
    } catch {
      // No se corta la pantalla por esto: el resto del ticket se lee igual.
    }
  }, [id, ticket]);

  useEffect(() => {
    void refreshConducta();
  }, [refreshConducta]);

  // Unidades y categorías del consorcio del ticket: se necesitan para validar.
  // Sin la lista de unidades no se puede elegir la unidad señalada en una
  // CONDUCTA, y la API rechaza la validación sin ese dato.
  useEffect(() => {
    if (!ticket) return;
    let vigente = true;
    void (async () => {
      try {
        const [us, cs, c] = await Promise.all([
          listUnidades(ticket.consorcioId),
          listCategorias(ticket.consorcioId),
          getConsorcio(ticket.consorcioId),
        ]);
        if (!vigente) return;
        setUnidades(us);
        setCategorias(cs);
        setCons(c);
      } catch {
        // No es fatal: la validación de infraestructura funciona igual. El
        // selector de conducta avisa por su cuenta si la lista quedó vacía.
      }
    })();
    return () => {
      vigente = false;
    };
  }, [ticket?.consorcioId, ticket]);

  if (!id) return <div className="error">Sin id</div>;

  async function doTransition(to: TicketEstado, body: Record<string, string> = {}) {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Parameters<typeof transitionTicket>[1] = { to, ...(body as object) } as Parameters<typeof transitionTicket>[1];
      await transitionTicket(ticket.id, payload);
      // Se recarga en vez de usar la respuesta de la transición: ese endpoint
      // devuelve la fila del ticket sin `clasificacion` —la sugerencia de la IA
      // la agrega solo `GET /tickets/:id`—, así que pisar el estado con ella
      // dejaba el panel de IA en blanco ("sin clasificar") hasta recargar la
      // página, justo después de la acción que la corrige. Y de paso el
      // historial gana una fila en cada transición, así que también estaba
      // quedando viejo.
      await refresh();
      setShowValidar(false);
      setNota('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRegistrarConducta(e: FormEvent) {
    e.preventDefault();
    if (!ticket) return;
    setBusy(true);
    setError(null);
    try {
      await createRegistroConducta(ticket.id, {
        resultado: rcResultado,
        ...(rcDetalle && { detalle: rcDetalle }),
      });
      setRcDetalle('');
      await refreshConducta();
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
        estado: gEstado,
      });
      setGDesc('');
      setGMonto('');
      setGComprobante('');
      setGEstado('CONFIRMADO');
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
  const ia = ticket.clasificacion ?? null;
  const confianzaPct = ia?.confianza != null ? Math.round(ia.confianza * 100) : null;
  const esConducta = ticket.tipo === 'CONDUCTA';
  const etiquetaDe = (unidadId: string | null): string => {
    if (!unidadId) return 'común';
    return unidades.find((u) => u.id === unidadId)?.etiqueta ?? unidadId.slice(0, 8);
  };

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
        {/* Acá había un botón "Notificar vecinos" sin handler. No se reemplaza
            por uno funcional porque el sistema no tiene aviso manual: las
            notificaciones salen solas en cada transición de estado (RF-G01) y
            se auditan en Notificaciones. Un botón que promete algo que el
            sistema no hace es peor que no tenerlo. */}
        <Link to={`/notificaciones?ticket=${ticket.id}`} className="btn ghost">
          <Icons.bell size={14} />Ver avisos enviados
        </Link>
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
                    {ia
                      ? `${ia.modelo} · prompt ${ia.promptVersion}`
                      : 'Cargado a mano por la administración — sin clasificar'}
                  </div>
                </div>
                {/* La confianza sale de `clasificacion_ia`. Antes había un 85%
                    fijo escrito en el código: el admin decidía mirando un
                    número inventado. Si no hay clasificación no se muestra
                    ninguno. */}
                {confianzaPct !== null && (
                  <span className={`chip ${confianzaPct >= 80 ? 'blue' : 'med'}`}>
                    <span className="mono">{confianzaPct}%</span> confianza
                  </span>
                )}
                {ia?.corregidoPorAdmin && (
                  <span className="chip ok" title="La sugerencia fue corregida al validar">corregida</span>
                )}
              </div>
              <div className="ai-panel-body">
                <div className="ai-keyvals">
                  <div>
                    <div className="keyval-k">Categoría sugerida</div>
                    <div className="keyval-v">
                      {ia?.sugerido.categoria ?? <span className="muted">—</span>}
                    </div>
                  </div>
                  <div>
                    <div className="keyval-k">Tipo sugerido</div>
                    <div className="keyval-v">
                      {ia?.sugerido.tipo === 'CONDUCTA'
                        ? 'Conducta'
                        : ia?.sugerido.tipo === 'INFRAESTRUCTURA'
                          ? 'Infraestructura'
                          : <span className="muted">—</span>}
                    </div>
                  </div>
                  <div>
                    <div className="keyval-k">Origen sugerido</div>
                    <div className={`keyval-v ${ia?.sugerido.origen === 'ESPACIO_COMUN' ? 'common' : ''}`}>
                      {ia?.sugerido.origen === 'ESPACIO_COMUN'
                        ? 'Espacio común'
                        : ia?.sugerido.origen === 'UNIDAD'
                          ? 'Unidad privada'
                          : <span className="muted">—</span>}
                    </div>
                  </div>
                  <div>
                    <div className="keyval-k">Urgencia (vigente)</div>
                    <div className={`keyval-v ${URGENCIA_CLS[ticket.urgencia]}`}>
                      {URGENCIA_LABEL[ticket.urgencia]}
                    </div>
                  </div>
                  <div>
                    <div className="keyval-k">Estado actual</div>
                    <div className="keyval-v">{ESTADO_LABEL[ticket.estado]}</div>
                  </div>
                </div>

                {/* RF-F01: la unidad que el modelo dedujo del texto NO se imputa
                    sola. Se muestra como pista para que el admin la confirme
                    contra la lista real de unidades. */}
                {ia?.sugerido.unidad_reportada_texto && (
                  <div className="muted small mt-2">
                    El vecino mencionó: “{ia.sugerido.unidad_reportada_texto}”. Confirmá la unidad al validar.
                  </div>
                )}

                <div className="ai-summary">
                  <b style={{ color: 'var(--cf-ink)' }}>Descripción:</b> {ticket.descripcionNormalizada}
                </div>

                {/* RF-C07: lo que costó clasificar este ticket. Se persistía en
                    la base y no se mostraba en ninguna pantalla. */}
                {ia && (ia.costoUsd || ia.latenciaMs || ia.tokensIn) && (
                  <div className="muted small mt-2" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {ia.costoUsd && <span>Costo IA: <span className="mono">US$ {Number(ia.costoUsd).toFixed(6)}</span></span>}
                    {ia.tokensIn !== null && <span>Tokens: <span className="mono">{ia.tokensIn}→{ia.tokensOut ?? 0}</span></span>}
                    {ia.latenciaMs !== null && <span>Latencia: <span className="mono">{ia.latenciaMs} ms</span></span>}
                    {ia.cacheHit && <span>cache hit</span>}
                  </div>
                )}

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
                        {esConducta ? (
                          <>
                            {/* RF-F01: sin esto la validación de una conducta es
                                imposible. La API la exige (y hay un CHECK en la
                                base que la respalda), así que el botón fallaba
                                siempre: el circuito entero de conducta quedaba
                                inalcanzable desde el panel. */}
                            <div className="uppercase mt-2">Unidad señalada (obligatoria)</div>
                            <div className="muted small mt-2">
                              Es la unidad del vecino denunciado. Define quién ve el ticket, así que
                              conviene confirmarla antes de validar.
                            </div>
                            <label className="mt-2">
                              <span>Unidad</span>
                              <select value={unidadReportada} onChange={(e) => setUnidadReportada(e.target.value)} required>
                                <option value="">Elegí una unidad…</option>
                                {unidades.map((u) => (
                                  <option key={u.id} value={u.id}>{u.etiqueta}</option>
                                ))}
                              </select>
                            </label>
                            {unidades.length === 0 && (
                              <div className="error small mt-2">
                                Este consorcio no tiene unidades cargadas. Cargá la unidad del vecino
                                señalado en Unidades y volvé.
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="uppercase mt-2">Origen (afecta visibilidad)</div>
                            <div className="segment mt-2">
                              <button type="button" className={origenChoice === 'ESPACIO_COMUN' ? 'on' : ''} onClick={() => setOrigenChoice('ESPACIO_COMUN')}>Espacio común</button>
                              <button type="button" className={origenChoice === 'UNIDAD' ? 'on' : ''} onClick={() => setOrigenChoice('UNIDAD')}>Unidad</button>
                            </div>
                            <div className="muted small mt-2">
                              {origenChoice === 'ESPACIO_COMUN'
                                ? 'Lo van a ver todos los residentes del consorcio, con su costo confirmado.'
                                : 'Lo van a ver solo la administración y los ocupantes de la unidad.'}
                            </div>
                          </>
                        )}

                        {/* La categoría corregida por el admin alimenta el
                            dataset de RF-C04. El campo existía en la API y
                            ninguna pantalla lo mandaba, así que la corrección
                            nunca se registraba. */}
                        {categorias.length > 0 && (
                          <label className="mt-3">
                            <span>
                              Categoría
                              {ia?.sugerido.categoria ? ` (la IA sugirió “${ia.sugerido.categoria}”)` : ''}
                            </span>
                            <select value={categoriaChoice} onChange={(e) => setCategoriaChoice(e.target.value)}>
                              <option value="">Sin cambiar</option>
                              {categorias.map((c) => (
                                <option key={c.id} value={c.id}>{c.nombre}</option>
                              ))}
                            </select>
                          </label>
                        )}

                        <div className="mt-3">
                          <label>
                            <span>Nota interna</span>
                            <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional: contexto para el equipo" />
                          </label>
                        </div>
                        <div className="actions mt-3">
                          <button
                            type="button"
                            className="btn primary"
                            disabled={busy || (esConducta && !unidadReportada)}
                            onClick={() =>
                              doTransition('VALIDADO', {
                                origen: esConducta ? 'UNIDAD' : origenChoice,
                                ...(esConducta && { unidad_reportada_id: unidadReportada }),
                                ...(categoriaChoice && { categoria_id: categoriaChoice }),
                                ...(nota && { nota }),
                              })
                            }
                          >
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
                  {/* El BORRADOR existía en la API y en la base desde el
                      principio, y el panel mandaba siempre CONFIRMADO: no había
                      forma de anotar un presupuesto tentativo sin publicarlo a
                      los vecinos, que es justamente para qué está el estado. */}
                  <label>
                    <span>Estado</span>
                    <select value={gEstado} onChange={(e) => setGEstado(e.target.value as 'BORRADOR' | 'CONFIRMADO')}>
                      <option value="CONFIRMADO">Confirmado — visible a los vecinos</option>
                      <option value="BORRADOR">Borrador — solo la administración</option>
                    </select>
                  </label>
                  <button type="submit" className="btn primary" disabled={busy || !gDesc || !gMonto}>
                    {gEstado === 'BORRADOR' ? 'Guardar borrador' : 'Confirmar gasto'}
                  </button>
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
                      <th>Estado</th>
                      <th>Comprobante</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.map((g) => (
                      <tr key={g.id}>
                        <td>{g.descripcion}</td>
                        <td className="mono">{g.moneda} {Number(g.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        <td>
                          <span className={`chip ${g.estado === 'CONFIRMADO' ? 'ok' : 'med'}`}>
                            {g.estado === 'CONFIRMADO' ? 'confirmado' : 'borrador'}
                          </span>
                        </td>
                        <td>{g.comprobanteUrl ? <a href={g.comprobanteUrl} target="_blank" rel="noreferrer">ver</a> : <span className="muted">—</span>}</td>
                        <td className="muted small">{new Date(g.createdAt).toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="muted small mt-2">
                El total de arriba suma solo los confirmados: es el número que ven los vecinos
                cuando el ticket es de espacio común.
              </div>
            </div>

            {/* Convivencia (RF-F03). Cierra el circuito de una conducta: el
                admin habla con las partes y deja asentado en qué terminó. Queda
                registrado contra la unidad SEÑALADA y va a la bitácora. */}
            {esConducta && (
              <div className="card">
                <div className="row-between" style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Avisos y sanciones</div>
                  {ticket.unidadReportadaId && (
                    <span className="muted small">
                      unidad {etiquetaDe(ticket.unidadReportadaId)} · {convivencia.length} en su historial
                    </span>
                  )}
                </div>

                {!ticket.unidadReportadaId ? (
                  <div className="muted small">
                    Validá el ticket indicando la unidad señalada para poder registrar el resultado.
                  </div>
                ) : (
                  <>
                    {/* Los antecedentes van arriba de la decisión: saber que es la
                        cuarta vez cambia si corresponde un aviso o una sanción. */}
                    {convivencia.length > 0 && (
                      <div className="card tight" style={{ marginBottom: 12 }}>
                        <div className="uppercase">Antecedentes de la unidad</div>
                        {convivencia.map((ev) => (
                          <div key={ev.id} className="row-between" style={{ paddingTop: 6 }}>
                            <span className="small">
                              <span className={`chip ${ev.resultado === 'SANCION' ? 'crit' : ev.resultado === 'AVISO' ? 'med' : ''}`}>
                                {ev.resultado.toLowerCase()}
                              </span>{' '}
                              {ev.ticketId === ticket.id ? 'este reporte' : ev.ticketTitulo}
                            </span>
                            <span className="muted small">{shortDate(ev.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <form className="form-grid card tight" onSubmit={onRegistrarConducta}>
                      <label>
                        <span>En qué terminó</span>
                        <select value={rcResultado} onChange={(e) => setRcResultado(e.target.value as ResultadoConducta)}>
                          <option value="AVISO">Aviso a la unidad</option>
                          <option value="SANCION">Sanción registrada</option>
                          <option value="DESCARTADO">Se descartó el reporte</option>
                        </select>
                      </label>
                      <label>
                        <span>Detalle</span>
                        <textarea
                          rows={2}
                          value={rcDetalle}
                          onChange={(e) => setRcDetalle(e.target.value)}
                          maxLength={2000}
                          placeholder="Qué se le dijo, con quién se habló"
                        />
                      </label>
                      <button type="submit" className="btn primary" disabled={busy}>
                        Registrar
                      </button>
                    </form>

                    {registros.length > 0 && (
                      <table className="grid mt-3">
                        <thead>
                          <tr><th>Resultado</th><th>Detalle</th><th style={{ width: 150 }}>Fecha</th></tr>
                        </thead>
                        <tbody>
                          {registros.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <span className={`chip ${r.resultado === 'SANCION' ? 'crit' : r.resultado === 'AVISO' ? 'med' : ''}`}>
                                  {r.resultado.toLowerCase()}
                                </span>
                              </td>
                              <td>{r.detalle ?? <span className="muted">—</span>}</td>
                              <td className="muted small">{shortDate(r.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Historial auditable (RF-D02). El endpoint existía y ninguna
                pantalla lo llamaba, así que no había forma de ver quién movió
                el ticket ni con qué nota. */}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Historial del ticket</div>
              {historial.length === 0 ? (
                <div className="muted small">Sin eventos registrados.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historial.map((h, i) => (
                    <div key={`${h.at}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, lineHeight: 1.35 }}>
                        <div style={{ fontSize: 13 }}>
                          {h.estadoAnterior && h.estadoNuevo
                            ? `${ESTADO_LABEL[h.estadoAnterior]} → ${ESTADO_LABEL[h.estadoNuevo]}`
                            : h.estadoNuevo
                              ? `Creado como ${ESTADO_LABEL[h.estadoNuevo]}`
                              : h.transicion}
                          {h.autorTipo && (
                            <span className="muted small"> · {h.autorTipo === 'ADMIN' ? 'administración' : 'residente'}</span>
                          )}
                        </div>
                        {h.nota && <div className="muted small" style={{ marginTop: 2 }}>{h.nota}</div>}
                      </div>
                      <span className="muted small" style={{ flexShrink: 0 }}>{shortDate(h.at)}</span>
                    </div>
                  ))}
                </div>
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
                <dd className="small">{cons?.nombre ?? <span className="mono">{ticket.consorcioId.slice(0, 8)}</span>}</dd>
                {/* En un ticket de espacio común, `unidad_id` es la unidad de
                    QUIEN REPORTÓ —el bot imputa la del vecino que escribe—, no
                    dónde está el problema. Etiquetarla "Unidad" a secas invitaba a
                    leer que el SUM sucio era de la 1B. */}
                <dt>{ticket.origen === 'ESPACIO_COMUN' ? 'Reportó desde' : 'Unidad'}</dt>
                <dd className="small">{etiquetaDe(ticket.unidadId)}</dd>
                <dt>Visibilidad</dt>
                <dd>
                  {!tieneVisibilidad
                    ? 'Sin validar'
                    : esConducta
                      ? 'Administración + ocupantes de la unidad señalada'
                      : ticket.origen === 'ESPACIO_COMUN'
                        ? 'Todos los vecinos'
                        : 'Solo ocupantes'}
                </dd>
                <dt>Tipo</dt>
                <dd>{esConducta ? 'Conducta (anónimo)' : 'Infraestructura'}</dd>
                {esConducta && (
                  <>
                    <dt>Unidad señalada</dt>
                    <dd className="small">
                      {ticket.unidadReportadaId
                        ? etiquetaDe(ticket.unidadReportadaId)
                        : <span className="muted">sin confirmar</span>}
                    </dd>
                  </>
                )}
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
