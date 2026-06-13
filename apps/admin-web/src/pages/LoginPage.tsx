import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login, setToken } from '../lib/api.js';
import { useAuth } from '../lib/auth-ctx.js';

const DEMO = [
  { email: 'admin@consorciofix.dev', pwd: 'admin123', label: 'Administradora' },
  { email: 'super@consorciofix.dev', pwd: 'super123', label: 'Super admin' },
  { email: 'propi@consorciofix.dev', pwd: 'resi123', label: 'Propietaria 4A' },
  { email: 'inqui@consorciofix.dev', pwd: 'resi123', label: 'Inquilina 4A' },
];

export function LoginPage(): JSX.Element {
  const { setSession } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('admin@consorciofix.dev');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function doLogin(e?: FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await login(email.trim(), password);
      setToken(r.accessToken);
      setSession(r.user);
      const from = (loc.state as { from?: string } | null)?.from ?? '/';
      nav(from, { replace: true });
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
      </form>
    </div>
  );
}
