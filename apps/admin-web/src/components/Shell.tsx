import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { listConsorcios, type Consorcio } from '../lib/api.js';
import { useAuth } from '../lib/auth-ctx.js';
import { Icons } from './Icons.js';

interface ShellProps {
  children?: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: (typeof Icons)[keyof typeof Icons];
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Bandeja', icon: Icons.inbox, end: true },
  { to: '/metricas', label: 'Resumen', icon: Icons.home },
  { to: '/consorcios', label: 'Consorcios', icon: Icons.building },
  { to: '/unidades', label: 'Unidades', icon: Icons.list },
  { to: '/residentes', label: 'Vecinos', icon: Icons.people },
  { to: '/notificaciones', label: 'Notificaciones', icon: Icons.bell },
  { to: '/bitacora', label: 'Bitácora', icon: Icons.shield },
];

/**
 * Solo para el super administrador de la plataforma: da de alta administraciones
 * (RF-A01). No se muestra al ADMIN porque la API le responde 403, y ofrecerle un
 * link que siempre falla es peor que no ofrecerlo.
 */
const NAV_SUPER: NavItem[] = [
  { to: '/administraciones', label: 'Administraciones', icon: Icons.building },
];

export function Shell(_props: ShellProps): JSX.Element {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listConsorcios().then(setConsorcios).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!switcherOpen) return;
    function onOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [switcherOpen]);

  function goToConsorcio(id: string) {
    setSwitcherOpen(false);
    nav(`/unidades?consorcio=${id}`);
  }

  const initials = (user?.nombre ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const totalConsorcios = consorcios.length;
  const firstName = consorcios[0]?.nombre ?? 'Sin consorcios';

  function onLogout() {
    logout();
    nav('/login', { replace: true });
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">CF</div>
          <div>
            <div className="sidebar-title">ConsorcioFix</div>
            <div className="sidebar-subtitle">Panel administrador</div>
          </div>
        </div>

        <div ref={switcherRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="sidebar-tenant"
            style={{ width: '100%', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
            onClick={() => setSwitcherOpen((o) => !o)}
            disabled={totalConsorcios === 0}
          >
            <div className="sidebar-tenant-icon">
              <Icons.building size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {firstName}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--cf-ink-3)' }}>
                {totalConsorcios === 0 ? 'agregá uno' : totalConsorcios === 1 ? '1 consorcio' : `${totalConsorcios} consorcios`}
              </div>
            </div>
            <Icons.chevDown size={14} stroke="var(--cf-ink-3)" />
          </button>

          {switcherOpen && (
            <div
              className="card"
              style={{
                position: 'absolute', top: '100%', left: 14, right: 14, marginTop: 4,
                padding: 6, zIndex: 20, maxHeight: 260, overflowY: 'auto',
              }}
            >
              {consorcios.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn ghost sm"
                  style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 2 }}
                  onClick={() => goToConsorcio(c.id)}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {[...NAV, ...(user?.kind === 'SUPER_ADMIN' ? NAV_SUPER : [])].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end ?? false}>
              {({ isActive }) => (
                <>
                  <Icon size={16} sw={isActive ? 2 : 1.7} />
                  <span style={{ flex: 1 }}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{initials}</div>
          <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.nombre}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--cf-ink-3)' }}>
              {user?.kind === 'SUPER_ADMIN' ? 'Super admin' : 'Administradora'}
            </div>
          </div>
          <button type="button" onClick={onLogout} className="btn link" style={{ padding: 4 }} title="Salir">
            <Icons.more size={14} stroke="var(--cf-ink-3)" />
          </button>
        </div>
      </aside>

      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function Topbar({ title, subtitle, actions }: TopbarProps): JSX.Element {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
      </div>
      {/* Acá había un buscador global con un atajo "⌘K" dibujado: el input no
          tenía value ni onChange y el atajo no existía en ningún listener, así
          que era el control más visible del panel y no hacía absolutamente
          nada. La búsqueda real vive en la bandeja, que es donde hay algo que
          buscar; un buscador global honesto necesitaría un endpoint de búsqueda
          que la API todavía no tiene. */}
      <div className="topbar-actions">{actions}</div>
    </div>
  );
}
