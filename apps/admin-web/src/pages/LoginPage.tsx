import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login, setRefreshToken, setToken } from '../lib/api.js';
import { useAuth } from '../lib/auth-ctx.js';

/**
 * Atajos para las cuentas del seed. Sirven muchísimo para desarrollar y para la
 * demo de la defensa, pero son credenciales reales del entorno de desarrollo:
 * si el panel se publica, quedan en texto plano dentro del bundle de JS que
 * cualquiera puede leer, apuntando a usuarios que el seed crea de verdad.
 *
 * `import.meta.env.DEV` es false en el build de producción, así que Vite elimina
 * la lista entera del bundle en vez de solo esconder los botones.
 */
const DEMO = import.meta.env.DEV
  ? [
      { email: 'admin@consorciofix.dev', pwd: 'admin123', label: 'Administradora' },
      { email: 'super@consorciofix.dev', pwd: 'super123', label: 'Super admin' },
      { email: 'propi@consorciofix.dev', pwd: 'resi123', label: 'Propietaria 4A' },
      { email: 'inqui@consorciofix.dev', pwd: 'resi123', label: 'Inquilina 4A' },
    ]
  : [];

/**
 * Rutas que solo puede usar el SUPER_ADMIN. Si el login viene con un `from` que
 * apunta a una de ellas y quien entra no lo es, se lo lleva al inicio.
 */
const SOLO_SUPER_ADMIN = ['/administraciones'];

export function LoginPage(): JSX.Element {
  const { setSession } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Precargado solo en desarrollo: en producción el formulario arranca vacío.
  const [email, setEmail] = useState(DEMO[0]?.email ?? '');
  const [password, setPassword] = useState(DEMO[0]?.pwd ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function doLogin(e?: FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await login(email.trim(), password);
      setToken(r.accessToken);
      // El refresh se guardaba en ninguna parte: la respuesta lo trae y se
      // descartaba, así que la sesión no se podía renovar y moría a los 15 min.
      setRefreshToken(r.refreshToken);
      setSession(r.user);
      // `from` es la ruta a la que el usuario quería entrar antes de que el
      // guard lo mandara al login. Restaurarla es correcto cuando se vence la
      // sesión y la persona vuelve a entrar, pero **cruza identidades**: si
      // venías de /administraciones como super admin y ahora entrás como
      // administradora, te devolvía a una página que tu rol no puede usar y lo
      // primero que veías era el cartel rojo de "esta sección no te corresponde".
      const from = (loc.state as { from?: string } | null)?.from ?? '/';
      const permitida = !SOLO_SUPER_ADMIN.some((ruta) => from.startsWith(ruta)) || r.user.kind === 'SUPER_ADMIN';
      nav(permitida ? from : '/', { replace: true });
    } catch (err) {
      setError((err as Error).message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card stack" onSubmit={doLogin}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div className="sidebar-logo" style={{ width: 40, height: 40, fontSize: 16, borderRadius: 10 }}>CF</div>
          <div>
            <h1>ConsorcioFix</h1>
            <div className="muted small">Panel administrador</div>
          </div>
        </div>
        <p className="muted">Iniciá sesión con tu cuenta.</p>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" className="btn primary" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        {DEMO.length > 0 && (
        <div className="mt-2" style={{ borderTop: '1px solid var(--cf-line)', paddingTop: 12 }}>
          <div className="uppercase" style={{ marginBottom: 6 }}>Cuentas demo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.pwd);
                }}
                style={{ justifyContent: 'flex-start', height: 32 }}
              >
                <span className="mono" style={{ fontSize: 11 }}>{d.email}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--cf-ink-3)', fontWeight: 500 }}>{d.label}</span>
              </button>
            ))}
          </div>
        </div>
        )}
      </form>
    </div>
  );
}
