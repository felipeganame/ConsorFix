import { useEffect, useState, type FormEvent } from 'react';
import { Icons } from '../components/Icons.js';
import { Topbar } from '../components/Shell.js';
import { createTenant, listTenants, type Tenant } from '../lib/api.js';
import { useAuth } from '../lib/auth-ctx.js';

/**
 * ABM de administraciones (RF-A01). Solo SUPER_ADMIN.
 *
 * El endpoint existía desde el PR #38 y no había pantalla: dar de alta un
 * cliente nuevo del SaaS —lo primero que pasa cuando alguien compra— había que
 * hacerlo con un INSERT a mano en la base.
 *
 * La administración se crea junto con su primer admin en una sola transacción:
 * un tenant sin nadie que pueda entrar no sirve para nada, y hacerlo en dos
 * pasos deja una ventana en la que existe una administración sin dueño.
 */
export function AdministracionesPage(): JSX.Element {
  const { user } = useAuth();
  const [items, setItems] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [nombre, setNombre] = useState('');
  const [plan, setPlan] = useState<'basico' | 'pro'>('basico');
  const [adminNombre, setAdminNombre] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  function load() {
    listTenants()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }
  useEffect(load, []);

  if (user?.kind !== 'SUPER_ADMIN') {
    return (
      <>
        <Topbar title="Administraciones" />
        <div className="content">
          <section>
            <div className="error">
              Esta sección es solo para el super administrador de la plataforma.
            </div>
          </section>
        </div>
      </>
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const creado = await createTenant({
        nombre,
        plan,
        admin: { nombre: adminNombre, email: adminEmail, password: adminPassword },
      });
      setOk(`Se creó “${creado.nombre}”. Su administrador ya puede entrar con ${creado.admin.email}.`);
      setNombre('');
      setAdminNombre('');
      setAdminEmail('');
      setAdminPassword('');
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
        title="Administraciones"
        subtitle={`${items.length} ${items.length === 1 ? 'administración' : 'administraciones'} en la plataforma`}
        actions={
          <button type="button" className="btn primary" onClick={() => setShowForm((s) => !s)}>
            <Icons.plus size={14} sw={2.2} /> {showForm ? 'Cancelar' : 'Nueva administración'}
          </button>
        }
      />
      <div className="content">
        <section className="stack">
          {error && <div className="error">{error}</div>}
          {ok && <div className="chip ok">{ok}</div>}

          {showForm && (
            <form className="card form-grid" onSubmit={onCreate}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Alta de una administración</div>
              <label>
                <span>Nombre de la administración</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={140} placeholder="Ej. Administración Rivadavia" />
              </label>
              <label>
                <span>Plan</span>
                <select value={plan} onChange={(e) => setPlan(e.target.value as 'basico' | 'pro')}>
                  <option value="basico">Básico</option>
                  <option value="pro">Pro</option>
                </select>
              </label>

              <div className="uppercase mt-2">Su primer administrador</div>
              <label>
                <span>Nombre</span>
                <input value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} required minLength={2} maxLength={140} />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
              </label>
              <label>
                <span>Contraseña</span>
                {/* 10 caracteres, no 6: es la cuenta que administra un tenant
                    entero. Lo exige la API, así que el mínimo del form coincide
                    para que el error salte acá y no después de enviar. */}
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  minLength={10}
                  maxLength={200}
                  placeholder="Mínimo 10 caracteres"
                />
              </label>
              <button type="submit" className="btn primary" disabled={busy || !nombre || !adminEmail || adminPassword.length < 10}>
                {busy ? 'Creando…' : 'Crear administración y su admin'}
              </button>
            </form>
          )}

          <div className="card">
            {items.length === 0 ? (
              <div className="muted small">Todavía no hay administraciones.</div>
            ) : (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Administración</th>
                    <th>Plan</th>
                    <th>Alta</th>
                    <th>Id</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.nombre}</strong></td>
                      <td><span className="chip">{t.plan}</span></td>
                      <td className="muted small">{new Date(t.createdAt).toLocaleDateString('es-AR')}</td>
                      <td className="mono small">{t.id.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
