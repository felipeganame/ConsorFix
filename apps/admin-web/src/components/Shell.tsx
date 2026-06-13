import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
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

export function Shell(_props: ShellProps): JSX.Element {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);

  useEffect(() => {
    listConsorcios().then(setConsorcios).catch(() => undefined);
  }, []);

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

        <div className="sidebar-tenant">
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
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
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
      <div className="topbar-actions">
        <div className="search">
          <Icons.search size={14} />
          <input placeholder="Buscar incidentes, vecinos…" />
          <span className="mono" style={{ background: 'var(--cf-bg)', padding: '1px 5px', borderRadius: 4, fontSize: 10.5 }}>⌘K</span>
        </div>
        {actions}
      </div>
    </div>
  );
}
