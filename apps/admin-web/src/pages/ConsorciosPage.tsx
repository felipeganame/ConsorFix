import { useEffect, useState, type FormEvent } from 'react';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import {
  avisarConsorciosCambiaron,
  createConsorcio,
  listConsorcios,
  updateConsorcio,
  type Consorcio,
} from '../lib/api.js';

const TIPO_LABEL: Record<Consorcio['tipo'], string> = {
  EDIFICIO: 'Edificio',
  BARRIO: 'Barrio cerrado',
  OFICINAS: 'Oficinas',
};

export function ConsorciosPage(): JSX.Element {
  const [items, setItems] = useState<Consorcio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<Consorcio['tipo']>('EDIFICIO');
  const [direccion, setDireccion] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Edición en la propia fila: el caso real es corregir un nombre mal escrito o
  // la dirección, no llenar un formulario entero de nuevo.
  const [editando, setEditando] = useState<string | null>(null);
  const [edNombre, setEdNombre] = useState('');
  const [edDireccion, setEdDireccion] = useState('');

  // `cargando` no es decorativo: sin él la tabla afirmaba "Sin consorcios
  // cargados" mientras el pedido estaba en vuelo, y si fallaba mostraba el error
  // Y ADEMÁS la afirmación de que no hay ninguno. Son tres estados distintos:
  // no sé todavía, falló, o realmente no hay.
  const [cargando, setCargando] = useState(true);

  function load() {
    setCargando(true);
    listConsorcios()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }
  useEffect(load, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createConsorcio({ nombre, tipo, ...(direccion && { direccion }) });
      setNombre('');
      setDireccion('');
      setShowForm(false);
      load();
      avisarConsorciosCambiaron();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function empezarEdicion(c: Consorcio) {
    setEditando(c.id);
    setEdNombre(c.nombre);
    setEdDireccion(c.direccion ?? '');
    setError(null);
  }

  async function guardarEdicion(id: string) {
    setBusy(true);
    setError(null);
    try {
      await updateConsorcio(id, { nombre: edNombre, direccion: edDireccion });
      setEditando(null);
      load();
      avisarConsorciosCambiaron();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function alternarArchivado(c: Consorcio) {
    setBusy(true);
    setError(null);
    try {
      // Soft-delete: la fila se conserva porque los tickets viejos y su
      // historial la referencian. Archivado se saca de circulación, no se borra.
      await updateConsorcio(c.id, { archivado: !c.archivado });
      load();
      avisarConsorciosCambiaron();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title="Consorcios"
        subtitle={`${items.length} ${items.length === 1 ? 'consorcio' : 'consorcios'} bajo administración`}
        actions={
          <button type="button" className="btn primary" onClick={() => setShowForm((s) => !s)}>
            <Icons.plus size={14} sw={2.2} /> {showForm ? 'Cancelar' : 'Nuevo consorcio'}
          </button>
        }
      />
      <div className="content">
        <section className="stack">
          {showForm && (
            <form className="card form-grid" onSubmit={onCreate}>
              <label>
                <span>Nombre</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={140} placeholder="Ej. Edificio Belgrano 1234" />
              </label>
              <label>
                <span>Tipo</span>
                <select value={tipo} onChange={(e) => setTipo(e.target.value as Consorcio['tipo'])}>
                  {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>
                <span>Dirección</span>
                <input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={280} />
              </label>
              <button type="submit" className="btn primary" disabled={busy || !nombre}>Crear consorcio</button>
            </form>
          )}

          {error && <div className="error">{error}</div>}

          <table className="grid">
            <thead>
              <tr>
                <th>Consorcio</th>
                <th>Tipo</th>
                <th>Dirección</th>
                <th style={{ width: 100 }}>Estado</th>
                <th style={{ width: 170 }} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted center">
                    {cargando ? 'Cargando…' : error ? 'No se pudo cargar la lista.' : 'Sin consorcios cargados.'}
                  </td>
                </tr>
              )}
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    {editando === c.id ? (
                      <input value={edNombre} onChange={(e) => setEdNombre(e.target.value)} maxLength={140} />
                    ) : (
                      <>
                        <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                        <div className="mono small muted">#{c.id.slice(0, 8)}</div>
                      </>
                    )}
                  </td>
                  <td>{TIPO_LABEL[c.tipo]}</td>
                  <td className="muted">
                    {editando === c.id ? (
                      <input value={edDireccion} onChange={(e) => setEdDireccion(e.target.value)} maxLength={280} placeholder="Dirección" />
                    ) : (
                      (c.direccion ?? '—')
                    )}
                  </td>
                  <td>
                    {c.archivado
                      ? <span className="chip">Archivado</span>
                      : <span className="chip ok"><span className="dot" />Activo</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {editando === c.id ? (
                        <>
                          <button type="button" className="btn primary sm" disabled={busy || !edNombre} onClick={() => guardarEdicion(c.id)}>
                            Guardar
                          </button>
                          <button type="button" className="btn ghost sm" onClick={() => setEditando(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn ghost sm" onClick={() => empezarEdicion(c)}>Editar</button>
                          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => alternarArchivado(c)}>
                            {c.archivado ? 'Reactivar' : 'Archivar'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
