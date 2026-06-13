import { useEffect, useState, type FormEvent } from 'react';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import { createResidente, listResidentes, type Residente } from '../lib/api.js';

export function ResidentesPage(): JSX.Element {
  const [items, setItems] = useState<Residente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('+54');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  function load() {
    listResidentes().then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createResidente({
        nombre,
        telefono_e164: telefono,
        ...(email && { email }),
        ...(password && { password }),
      });
      setNombre('');
      setTelefono('+54');
      setEmail('');
      setPassword('');
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
        title="Vecinos"
        subtitle={`${items.length} ${items.length === 1 ? 'residente registrado' : 'residentes registrados'}`}
        actions={
          <button type="button" className="btn primary" onClick={() => setShowForm((s) => !s)}>
            <Icons.plus size={14} sw={2.2} /> {showForm ? 'Cancelar' : 'Nuevo vecino'}
          </button>
        }
      />
      <div className="content">
        <section className="stack">
          {showForm && (
            <form className="card form-grid" onSubmit={onCreate}>
              <label>
                <span>Nombre completo</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={140} />
              </label>
              <label>
                <span>Teléfono (E.164)</span>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} required pattern="\+[1-9]\d{6,14}" maxLength={16} placeholder="+5491100000000" />
              </label>
              <label>
                <span>Email (opcional)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                <span>Contraseña inicial</span>
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} maxLength={200} placeholder="Mínimo 6 caracteres" />
              </label>
              <button type="submit" className="btn primary" disabled={busy || !nombre || !telefono}>Crear vecino</button>
            </form>
          )}

          {error && <div className="error">{error}</div>}

          <table className="grid">
            <thead>
              <tr>
                <th>Vecino</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th style={{ width: 100 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className="muted center">Sin vecinos cargados.</td></tr>
              )}
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                    <div className="mono small muted">#{r.id.slice(0, 8)}</div>
                  </td>
                  <td className="mono">{r.telefonoE164}</td>
                  <td>{r.email ?? <span className="muted">—</span>}</td>
                  <td>
                    {r.activo
                      ? <span className="chip ok"><span className="dot" />Activo</span>
                      : <span className="chip">Inactivo</span>}
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
