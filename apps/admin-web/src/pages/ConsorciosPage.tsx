import { useEffect, useState, type FormEvent } from 'react';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import { createConsorcio, listConsorcios, type Consorcio } from '../lib/api.js';

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

  function load() {
    listConsorcios().then(setItems).catch((e) => setError(e.message));
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
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted center">Sin consorcios cargados.</td>
                </tr>
              )}
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                    <div className="mono small muted">#{c.id.slice(0, 8)}</div>
                  </td>
                  <td>{TIPO_LABEL[c.tipo]}</td>
                  <td className="muted">{c.direccion ?? '—'}</td>
                  <td>
                    {c.archivado
                      ? <span className="chip">Archivado</span>
                      : <span className="chip ok"><span className="dot" />Activo</span>}
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
