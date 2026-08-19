import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import {
  createTicket,
  getMetrics,
  listConsorcios,
  listTickets,
  listUnidades,
  type Consorcio,
  type MetricsOverview,
  type Ticket,
  type TicketEstado,
  type TicketOrigen,
  type TicketTipo,
  type TicketUrgencia,
  type Unidad,
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

/**
 * CSV del listado que el admin está viendo.
 *
 * Se arma en el cliente sobre los tickets ya cargados en vez de agregar un
 * endpoint de export: es exactamente lo que la pantalla muestra (mismos
 * filtros, mismo orden), no hay que mantener dos definiciones de "la bandeja",
 * y para los volúmenes de un consorcio no justifica más superficie de API.
 */
function toCsv(rows: Ticket[], nombreConsorcio: (id: string) => string): string {
  const cols = ['id', 'titulo', 'tipo', 'origen', 'urgencia', 'estado', 'votos', 'consorcio', 'creado'];
  const esc = (v: unknown): string => {
    const s = String(v ?? '');
    // Excel en es-AR abre con separador ; pero el estándar es , — se citan
    // todos los campos, así que da igual cuál interprete.
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lineas = rows.map((t) =>
    [
      t.id,
      t.titulo,
      t.tipo,
      t.origen ?? 'sin validar',
      t.urgencia,
      t.estado,
      t.votosCount,
      nombreConsorcio(t.consorcioId),
      new Date(t.createdAt).toISOString(),
    ]
      .map(esc)
      .join(','),
  );
  // BOM para que Excel reconozca UTF-8 y no rompa los acentos.
  return `\ufeff${cols.map(esc).join(',')}\n${lineas.join('\n')}\n`;
}

export function BandejaPage(): JSX.Element {
  const navigate = useNavigate();
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [consorcioFilter, setConsorcioFilter] = useState<string>('');
  const [estadoFilter, setEstadoFilter] = useState<TicketEstado | ''>('REGISTRADO');
  const [busqueda, setBusqueda] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [metrics, setMetrics] = useState<MetricsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alta manual (RF-B01 por mostrador): alguien reporta por teléfono o en la
  // reunión de consorcio y el admin lo carga a mano.
  const [showNuevo, setShowNuevo] = useState(false);
  const [nvConsorcio, setNvConsorcio] = useState('');
  const [nvUnidades, setNvUnidades] = useState<Unidad[]>([]);
  const [nvUnidad, setNvUnidad] = useState('');
  const [nvTipo, setNvTipo] = useState<TicketTipo>('INFRAESTRUCTURA');
  const [nvOrigen, setNvOrigen] = useState<TicketOrigen>('ESPACIO_COMUN');
  const [nvUrgencia, setNvUrgencia] = useState<TicketUrgencia>('MEDIA');
  const [nvTitulo, setNvTitulo] = useState('');
  const [nvDesc, setNvDesc] = useState('');
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    listConsorcios().then(setConsorcios).catch((e) => setError(e.message));
  }, []);

  // Unidades del consorcio elegido en el alta manual.
  useEffect(() => {
    if (!nvConsorcio) {
      setNvUnidades([]);
      setNvUnidad('');
      return;
    }
    let vigente = true;
    listUnidades(nvConsorcio)
      .then((us) => {
        if (vigente) setNvUnidades(us);
      })
      .catch(() => {
        if (vigente) setNvUnidades([]);
      });
    return () => {
      vigente = false;
    };
  }, [nvConsorcio]);

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

  const nombreConsorcio = (cid: string): string =>
    consorcios.find((c) => c.id === cid)?.nombre ?? cid.slice(0, 8);

  async function onCrearTicket(e: FormEvent) {
    e.preventDefault();
    setCreando(true);
    setError(null);
    try {
      const creado = await createTicket({
        consorcio_id: nvConsorcio,
        // En espacio común no hay unidad imputada; en conducta la unidad
        // señalada se confirma al validar (RF-F01), no acá.
        unidad_id: nvOrigen === 'UNIDAD' && nvUnidad ? nvUnidad : null,
        tipo: nvTipo,
        urgencia: nvUrgencia,
        ...(nvTipo === 'INFRAESTRUCTURA' && { origen_sugerido: nvOrigen }),
        titulo: nvTitulo,
        descripcion: nvDesc,
      });
      setShowNuevo(false);
      setNvTitulo('');
      setNvDesc('');
      navigate(`/tickets/${creado.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreando(false);
    }
  }

  function onExportar() {
    const csv = toCsv(sorted, nombreConsorcio);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    const scope = consorcioFilter ? nombreConsorcio(consorcioFilter).replace(/\W+/g, '-') : 'todos';
    a.download = `bandeja-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sorted = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = q
      ? tickets.filter(
          (t) =>
            t.titulo.toLowerCase().includes(q) ||
            t.descripcionNormalizada.toLowerCase().includes(q) ||
            t.id.toLowerCase().startsWith(q),
        )
      : tickets;
    return [...filtrados].sort((a, b) => {
      const ua = URGENCIA_RANK[a.urgencia] ?? 99;
      const ub = URGENCIA_RANK[b.urgencia] ?? 99;
      if (ua !== ub) return ua - ub;
      if (a.votosCount !== b.votosCount) return b.votosCount - a.votosCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tickets, busqueda]);

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
  const ambito = consorcioFilter ? 'en este consorcio' : 'en toda la administración';

  return (
    <>
      <Topbar
        title="Bandeja de entrada"
        // "IA pre-clasifica cada nuevo reporte" no era exacto: solo los reportes
        // que entran por el bot pasan por el clasificador. Los que se cargan
        // desde la app o a mano llegan sin clasificar, y prometer lo contrario
        // en la pantalla que usa la administradora todos los días es sembrar
        // desconfianza en el resto de los números.
        subtitle={`${sinTriar} sin triar · los reportes del bot llegan pre-clasificados por IA`}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={onExportar} disabled={sorted.length === 0}>
              <Icons.filter size={14} />Exportar CSV
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setNvConsorcio(consorcioFilter || consorcios[0]?.id || '');
                setShowNuevo((v) => !v);
              }}
              disabled={consorcios.length === 0}
            >
              <Icons.plus size={14} sw={2.2} />{showNuevo ? 'Cancelar' : 'Nuevo reporte'}
            </button>
          </>
        }
      />

      <div className="content">
        <section style={{ paddingBottom: 0 }}>
          <div className="kpi-strip">
            <div className="kpi">
              <div className="kpi-label">Sin triar</div>
              <div className="kpi-value">{sinTriar}</div>
              {/* Decía "en este consorcio" siempre, también con el filtro en
                  "Todos", donde el número es de toda la administración. */}
              <div className="kpi-delta">{ambito}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Alta urgencia</div>
              <div className="kpi-value">{criticos}</div>
              <div className="kpi-delta crit">requieren atención</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Tiempo medio resol.</div>
              <div className="kpi-value">{ttrLabel}</div>
              {/* Decía "métrica del tenant": "tenant" es vocabulario del código,
                  no de la administradora que lee esta pantalla (regla 8). Y el
                  promedio solo considera los tickets resueltos, que es el dato
                  que de verdad hay que aclarar acá. */}
              <div className="kpi-delta ok">solo tickets resueltos</div>
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
          <div className="filter-divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="uppercase">Buscar</span>
            {/* Filtra sobre lo ya cargado: título, descripción y prefijo del id.
                La API acota por consorcio y estado; el texto se resuelve acá
                para no pedir de nuevo en cada tecla. */}
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Título, texto o #id"
              style={{ height: 32, minWidth: 200 }}
            />
            {busqueda && (
              <button type="button" className="btn ghost sm" onClick={() => setBusqueda('')}>Limpiar</button>
            )}
          </div>
          <div className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--cf-ink-3)' }}>{sorted.length} resultados</span>
        </div>

        {showNuevo && (
          <section style={{ paddingTop: 0 }}>
            <form className="form-grid card" onSubmit={onCrearTicket}>
              <div className="form-full" style={{ fontSize: 13, fontWeight: 600 }}>Cargar un reporte a mano</div>
              <div className="form-full muted small">
                Para lo que llega por teléfono, en persona o en la reunión de consorcio. Queda sin
                reportante: el ticket es de la administración.
              </div>
              <label>
                <span>Consorcio</span>
                <select value={nvConsorcio} onChange={(e) => setNvConsorcio(e.target.value)} required>
                  <option value="">Elegí un consorcio…</option>
                  {consorcios.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Tipo</span>
                <select value={nvTipo} onChange={(e) => setNvTipo(e.target.value as TicketTipo)}>
                  <option value="INFRAESTRUCTURA">Infraestructura</option>
                  <option value="CONDUCTA">Conducta</option>
                </select>
              </label>
              {nvTipo === 'INFRAESTRUCTURA' && (
                <label>
                  <span>Origen</span>
                  <select value={nvOrigen} onChange={(e) => setNvOrigen(e.target.value as TicketOrigen)}>
                    <option value="ESPACIO_COMUN">Espacio común — lo ven todos los vecinos</option>
                    <option value="UNIDAD">Unidad — solo la administración y sus ocupantes</option>
                  </select>
                </label>
              )}
              {nvTipo === 'INFRAESTRUCTURA' && nvOrigen === 'UNIDAD' && (
                <label>
                  <span>Unidad afectada</span>
                  <select value={nvUnidad} onChange={(e) => setNvUnidad(e.target.value)} required>
                    <option value="">Elegí una unidad…</option>
                    {nvUnidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.etiqueta}</option>
                    ))}
                  </select>
                </label>
              )}
              {nvTipo === 'CONDUCTA' && (
                <div className="form-full muted small">
                  La unidad señalada se confirma al validar el ticket, no ahora.
                </div>
              )}
              <label>
                <span>Urgencia</span>
                <select value={nvUrgencia} onChange={(e) => setNvUrgencia(e.target.value as TicketUrgencia)}>
                  <option value="CRITICA">Crítica</option>
                  <option value="ALTA">Alta</option>
                  <option value="MEDIA">Media</option>
                  <option value="BAJA">Baja</option>
                </select>
              </label>
              <label>
                <span>Título</span>
                <input value={nvTitulo} onChange={(e) => setNvTitulo(e.target.value)} required minLength={3} maxLength={140} />
              </label>
              <label className="form-full">
                <span>Qué pasó</span>
                <textarea rows={3} value={nvDesc} onChange={(e) => setNvDesc(e.target.value)} required maxLength={4000} />
              </label>
              <button type="submit" className="btn primary" disabled={creando || !nvConsorcio || !nvTitulo || !nvDesc}>
                {creando ? 'Creando…' : 'Crear reporte'}
              </button>
            </form>
          </section>
        )}

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
              {/* Antes decía "Bot / App" en todos los tickets, incluidos los
                  que el admin cargaba a mano. `reportanteId` es null justamente
                  cuando no hubo un residente reportando. */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--cf-ink-2)' }}>
                {t.reportanteId ? (
                  <>
                    <Icons.whatsapp size={14} stroke="var(--cf-whatsapp-dk)" fill="var(--cf-whatsapp-dk)" />
                    <span>Bot / App</span>
                  </>
                ) : (
                  <span className="muted">Carga manual</span>
                )}
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
