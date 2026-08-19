import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  getTenantOverride,
  listConsorcios,
  listTenants,
  setTenantOverride,
  type Consorcio,
  type Tenant,
} from '../lib/api.js';
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
  const loc = useLocation();
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  /**
   * El SUPER_ADMIN no pertenece a ninguna administración, así que tiene que
   * elegir en cuál trabajar: la API le exige el header `x-tenant-id` en todo lo
   * que es de tenant y responde `no tenant in token` sin él.
   *
   * `apiFetch` ya mandaba ese header cuando había una administración elegida, y
   * **ninguna pantalla la dejaba elegir nunca**: la cañería estaba puesta y no
   * llegaba a ningún lado. El super admin entraba y la bandeja le mostraba el
   * error crudo de la API.
   */
  const esSuper = user?.kind === 'SUPER_ADMIN';
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantElegido, setTenantElegido] = useState<string | null>(getTenantOverride());

  useEffect(() => {
    if (!esSuper) return;
    listTenants().then(setTenants).catch(() => undefined);
  }, [esSuper]);

  useEffect(() => {
    // Sin administración elegida no hay consorcios que pedir: el request
    // fallaría y ensuciaría la consola con un error esperado.
    if (esSuper && !tenantElegido) return;
    listConsorcios().then(setConsorcios).catch(() => undefined);
  }, [esSuper, tenantElegido]);

  function elegirTenant(id: string) {
    setTenantOverride(id);
    setTenantElegido(id);
    setSwitcherOpen(false);
    // Recarga completa a propósito: cada pantalla trae sus datos en su propio
    // `useEffect` y no hay un store global que invalidar. Es un cambio de
    // contexto poco frecuente, así que la recarga es más confiable que
    // sincronizar diez pantallas a mano.
    window.location.reload();
  }

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
  const nombreTenant = tenants.find((t) => t.id === tenantElegido)?.nombre;
  // El selector de arriba muestra administraciones al super admin y consorcios
  // al resto: es el mismo lugar, pero el contexto que cada uno cambia es otro.
  const tituloSwitcher = esSuper
    ? (nombreTenant ?? 'Elegí administración')
    : (consorcios[0]?.nombre ?? 'Sin consorcios');
  const subtituloSwitcher = esSuper
    ? (tenantElegido ? 'administración activa' : 'ninguna elegida')
    : totalConsorcios === 0
      ? 'agregá uno'
      : totalConsorcios === 1
        ? '1 consorcio'
        : `${totalConsorcios} consorcios`;
  const faltaElegirTenant = esSuper && !tenantElegido && loc.pathname !== '/administraciones';

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
            /* Sin `width: 100%`: la clase ya tiene `margin: 0 14px` y es
               `display: flex`, así que ocupa el ancho disponible descontando sus
               márgenes. Con el 100% medía 232px + 28px de margen y se desbordaba
               del sidebar exactamente esos 28px. */
            style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
            title={esSuper && !tenantElegido ? 'Elegí una administración para trabajar' : tituloSwitcher}
            onClick={() => setSwitcherOpen((o) => !o)}
            disabled={esSuper ? tenants.length === 0 : totalConsorcios === 0}
          >
            <div className="sidebar-tenant-icon">
              <Icons.building size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tituloSwitcher}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--cf-ink-3)' }}>{subtituloSwitcher}</div>
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
              {esSuper
                ? tenants.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="btn ghost sm"
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        marginBottom: 2,
                        fontWeight: t.id === tenantElegido ? 700 : 500,
                      }}
                      onClick={() => elegirTenant(t.id)}
                    >
                      {t.nombre}
                    </button>
                  ))
                : consorcios.map((c) => (
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
        {faltaElegirTenant ? (
          <>
            <Topbar
              title="Elegí una administración"
              subtitle="Como super admin no perteneces a ninguna: tenés que indicar en cuál trabajar"
            />
            <div className="content">
              <section className="stack">
                <div className="card">
                  <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--cf-ink-2)' }}>
                    Los consorcios, las unidades y los tickets pertenecen a una administración.
                    Elegí una acá —o desde el selector de arriba a la izquierda— y el panel entero
                    va a mostrar sus datos.
                  </p>
                  {tenants.length === 0 ? (
                    <div className="muted small">
                      Todavía no hay ninguna. Creá la primera en{' '}
                      <NavLink to="/administraciones">Administraciones</NavLink>.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {tenants.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="btn ghost"
                          style={{ justifyContent: 'flex-start' }}
                          onClick={() => elegirTenant(t.id)}
                        >
                          <Icons.building size={14} /> {t.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        ) : (
          <Outlet />
        )}
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
