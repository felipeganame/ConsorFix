import { useEffect, useState, type FormEvent } from 'react';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import {
  createUnidad,
  listConsorcios,
  listUnidades,
  type Consorcio,
  type Unidad,
} from '../lib/api.js';

export function UnidadesPage(): JSX.Element {
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [consorcioId, setConsorcioId] = useState<string>('');
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [etiqueta, setEtiqueta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    listConsorcios()
      .then((cs) => {
        setConsorcios(cs);
        if (cs.length && !consorcioId) setConsorcioId(cs[0]!.id);
      })
      .catch((e) => setError(e.message));
  }, [consorcioId]);

  function load() {
    if (!consorcioId) return;
    listUnidades(consorcioId)
      .then(setUnidades)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [consorcioId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!consorcioId) return;
    setBusy(true);
    setError(null);
    try {
      await createUnidad({ consorcio_id: consorcioId, etiqueta });
      setEtiqueta('');
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
              <label>
                <span>Etiqueta</span>
                <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} required maxLength={40} placeholder="Ej. 4A o Lote 12" />
              </label>
              <button type="submit" className="btn primary" disabled={busy || !consorcioId || !etiqueta}>Crear unidad</button>
            </form>
          )}

          {error && <div className="error">{error}</div>}

          <table className="grid">
            <thead>
              <tr>
                <th>Etiqueta</th>
                <th style={{ width: 180 }}>Creada</th>
              </tr>
            </thead>
            <tbody>
              {unidades.length === 0 && (
                <tr><td colSpan={2} className="muted center">Sin unidades en este consorcio.</td></tr>
              )}
              {unidades.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.etiqueta}</div>
                    <div className="mono small muted">#{u.id.slice(0, 8)}</div>
                  </td>
                  <td className="muted small">{new Date(u.createdAt).toLocaleString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
