import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import {
  createUnidad,
  createUnidadesBulk,
  createVinculo,
  desvincular,
  listConsorcios,
  listResidentes,
  listUnidades,
  listVinculos,
  type Consorcio,
  type Residente,
  type Unidad,
  type Vinculo,
} from '../lib/api.js';

export function UnidadesPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [consorcioId, setConsorcioId] = useState<string>('');
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [etiqueta, setEtiqueta] = useState('');
  // Alta masiva: es como se carga un edificio de verdad, de a 80 unidades.
  const [modoLote, setModoLote] = useState(false);
  const [lote, setLote] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedUnidad, setSelectedUnidad] = useState<Unidad | null>(null);

  useEffect(() => {
    listConsorcios()
      .then((cs) => {
        setConsorcios(cs);
        if (!cs.length) return;
        const fromQuery = searchParams.get('consorcio');
        if (fromQuery && cs.some((c) => c.id === fromQuery)) {
          setConsorcioId(fromQuery);
        } else if (!consorcioId) {
          setConsorcioId(cs[0]!.id);
        }
      })
      .catch((e) => setError(e.message));
  }, [searchParams]);

  // Acá además hay un caso propio: sin consorcio elegido no hay nada que cargar,
  // y eso tampoco es "sin unidades".
  const [cargando, setCargando] = useState(false);

  function load() {
    if (!consorcioId) return;
    setCargando(true);
    listUnidades(consorcioId)
      .then(setUnidades)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }
  useEffect(load, [consorcioId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!consorcioId) return;
    setBusy(true);
    setError(null);
    try {
      if (modoLote) {
        // `POST /unidades/bulk` existía y ninguna pantalla lo usaba: cargar un
        // edificio de 80 unidades se hacía de a una. Hace onConflictDoNothing,
        // así que repetir una etiqueta ya cargada no rompe nada.
        const etiquetas = lote
          .split(/[\n,;]+/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (etiquetas.length === 0) throw new Error('No hay etiquetas para crear.');
        const creadas = await createUnidadesBulk({ consorcio_id: consorcioId, etiquetas });
        const repetidas = etiquetas.length - creadas.length;
        setInfo(
          `Se crearon ${creadas.length} de ${etiquetas.length}.` +
            (repetidas > 0 ? ` ${repetidas} ya existían y se dejaron como estaban.` : ''),
        );
        setLote('');
      } else {
        await createUnidad({ consorcio_id: consorcioId, etiqueta });
        setEtiqueta('');
        setInfo(null);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title="Unidades"
        subtitle={`${unidades.length} ${unidades.length === 1 ? 'unidad' : 'unidades'}`}
        actions={
          <button type="button" className="btn primary" onClick={() => setShowForm((s) => !s)} disabled={!consorcioId}>
            <Icons.plus size={14} sw={2.2} /> {showForm ? 'Cancelar' : 'Nueva unidad'}
          </button>
        }
      />
      <div className="content">
        <section className="stack">
          <div className="filters-bar" style={{ padding: '0 0 12px', borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="uppercase">Consorcio</span>
              <select value={consorcioId} onChange={(e) => setConsorcioId(e.target.value)} style={{ minWidth: 240, height: 32 }}>
                {consorcios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>

          {showForm && (
            <form className="card form-grid" onSubmit={onCreate}>
              <div className="segment">
                <button type="button" className={!modoLote ? 'on' : ''} onClick={() => setModoLote(false)}>Una unidad</button>
                <button type="button" className={modoLote ? 'on' : ''} onClick={() => setModoLote(true)}>Varias de una vez</button>
              </div>
              {modoLote ? (
                <label>
                  <span>Etiquetas (una por línea, o separadas por coma)</span>
                  <textarea
                    rows={6}
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    placeholder={'1A\n1B\n2A\n2B'}
                  />
                </label>
              ) : (
                <label>
                  <span>Etiqueta</span>
                  <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} maxLength={40} placeholder="Ej. 4A o Lote 12" />
                </label>
              )}
              <button
                type="submit"
                className="btn primary"
                disabled={busy || !consorcioId || (modoLote ? !lote.trim() : !etiqueta)}
              >
                {modoLote ? 'Crear las unidades' : 'Crear unidad'}
              </button>
            </form>
          )}

          {info && <div className="chip ok">{info}</div>}
          {error && <div className="error">{error}</div>}

          <table className="grid">
            <thead>
              <tr>
                <th>Etiqueta</th>
                <th style={{ width: 180 }}>Creada</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {unidades.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted center">
                    {!consorcioId
                      ? 'Elegí un consorcio.'
                      : cargando
                        ? 'Cargando…'
                        : error
                          ? 'No se pudo cargar la lista.'
                          : 'Sin unidades en este consorcio.'}
                  </td>
                </tr>
              )}
              {unidades.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedUnidad(u)}
                  style={{ cursor: 'pointer', background: selectedUnidad?.id === u.id ? 'var(--cf-blue-50)' : undefined }}
                >
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.etiqueta}</div>
                    <div className="mono small muted">#{u.id.slice(0, 8)}</div>
                  </td>
                  <td className="muted small">{new Date(u.createdAt).toLocaleString('es-AR')}</td>
                  <td className="muted small">›</td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedUnidad && <OcupantesPanel unidad={selectedUnidad} onClose={() => setSelectedUnidad(null)} />}
        </section>
      </div>
    </>
  );
}

function OcupantesPanel({ unidad, onClose }: { unidad: Unidad; onClose: () => void }): JSX.Element {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [residentes, setResidentes] = useState<Residente[]>([]);
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<'PROPIETARIO' | 'INQUILINO'>('PROPIETARIO');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    listVinculos(unidad.id).then(setVinculos).catch((e) => setError(e.message));
  }
  useEffect(load, [unidad.id]);
  useEffect(() => {
    listResidentes().then(setResidentes).catch((e) => setError(e.message));
  }, []);

  const residentesById = new Map(residentes.map((r) => [r.id, r]));

  async function onDesvincular(v: Vinculo) {
    const r = residentesById.get(v.residenteId);
    const nombre = r?.nombre ?? 'este vecino';
    if (!window.confirm(`¿Desvincular a ${nombre} de ${unidad.etiqueta}?`)) return;
    setError(null);
    try {
      await desvincular(v.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const match = residentes.find((r) => r.email?.toLowerCase() === target);
      if (!match) {
        setError('No hay ningún vecino con ese email. Creálo primero en la sección Vecinos.');
        return;
      }
      await createVinculo({ residente_id: match.id, unidad_id: unidad.id, rol });
      setEmail('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Vecinos de {unidad.etiqueta}</div>
          <div className="muted small">Propietarios e inquilinos vinculados a esta unidad</div>
        </div>
        <button type="button" className="btn ghost sm" onClick={onClose}>Cerrar</button>
      </div>

      {error && <div className="error">{error}</div>}

      <table className="grid">
        <thead>
          <tr>
            <th>Vecino</th>
            <th style={{ width: 130 }}>Rol</th>
            <th style={{ width: 100 }}>Estado</th>
            <th style={{ width: 110 }} />
          </tr>
        </thead>
        <tbody>
          {vinculos.length === 0 && (
            <tr><td colSpan={4} className="muted center">Sin vecinos vinculados todavía.</td></tr>
          )}
          {vinculos.map((v) => {
            const r = residentesById.get(v.residenteId);
            return (
              <tr key={v.id}>
                <td>{r?.nombre ?? <span className="mono small muted">#{v.residenteId.slice(0, 8)}</span>}</td>
                <td>
                  <span className={`chip ${v.rol === 'PROPIETARIO' ? 'blue' : ''}`}>
                    {v.rol === 'PROPIETARIO' ? 'Propietario' : 'Inquilino'}
                  </span>
                </td>
                <td>
                  {v.activo
                    ? <span className="chip ok"><span className="dot" />Activo</span>
                    : <span className="chip">Inactivo</span>}
                </td>
                <td>
                  {v.activo && (
                    <button type="button" className="btn ghost sm" onClick={() => onDesvincular(v)}>
                      Desvincular
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <form className="form-grid" onSubmit={onAdd} style={{ marginTop: 14, gap: 8 }}>
        <label>
          <span>Email del vecino a vincular</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vecino@ejemplo.com"
            required
          />
        </label>
        <label>
          <span>Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value as 'PROPIETARIO' | 'INQUILINO')}>
            <option value="PROPIETARIO">Propietario</option>
            <option value="INQUILINO">Inquilino</option>
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={busy || !email.trim()}>Vincular</button>
      </form>
      <div className="muted small" style={{ marginTop: 8 }}>
        ¿El vecino todavía no existe? Creálo primero en la sección Vecinos.
      </div>
    </div>
  );
}
