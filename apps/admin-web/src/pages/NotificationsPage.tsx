import { useEffect, useState } from 'react';
import { Topbar } from '../components/Shell.js';
import { listNotifs, type NotifEntry } from '../lib/api.js';

const ESTADO_CHIP: Record<string, string> = {
  PENDIENTE: 'med',
  ENVIADA: 'ok',
  FALLIDA: 'crit',
};

const CANAL_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  PUSH: 'Push (móvil)',
  EMAIL: 'Email',
};

const PLANTILLA_LABEL: Record<string, string> = {
  ticket_validated: 'Ticket validado',
  ticket_solucionado: 'Ticket resuelto',
  ticket_descartado: 'Ticket descartado',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString('es-AR');
}

export function NotificationsPage(): JSX.Element {
  const [items, setItems] = useState<NotifEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listNotifs()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const sent = items.filter((i) => i.estado === 'ENVIADA').length;
  const failed = items.filter((i) => i.estado === 'FALLIDA').length;
  const pending = items.filter((i) => i.estado === 'PENDIENTE').length;

  return (
    <>
      <Topbar title="Notificaciones" subtitle="Historial de envíos a vecinos (RF-G01..G03)" />
      <div className="content">
        <section style={{ paddingBottom: 0 }}>
          <div className="kpi-strip">
            <div className="kpi">
              <div className="kpi-label">Enviadas</div>
              <div className="kpi-value">{sent}</div>
              <div className="kpi-delta ok">entregadas</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Pendientes</div>
              <div className="kpi-value">{pending}</div>
              <div className="kpi-delta">en cola</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Fallidas</div>
              <div className="kpi-value">{failed}</div>
              <div className="kpi-delta crit">requieren revisión</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Total</div>
              <div className="kpi-value">{items.length}</div>
              <div className="kpi-delta">últimas 50</div>
            </div>
          </div>
        </section>
        <section>
          {error && <div className="error">{error}</div>}
          {loading && <div className="muted">Cargando…</div>}
          <table className="grid">
            <thead>
              <tr>
                <th>Plantilla</th>
                <th>Canal</th>
                <th>Ticket</th>
                <th>Estado</th>
                <th>Error</th>
                <th style={{ width: 120 }}>Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr><td colSpan={6} className="muted center">Sin notificaciones registradas.</td></tr>
              )}
              {items.map((n) => (
                <tr key={n.id} style={{ cursor: 'default' }}>
                  <td>{PLANTILLA_LABEL[n.plantilla] ?? n.plantilla}</td>
                  <td>{CANAL_LABEL[n.canal] ?? n.canal}</td>
                  <td className="mono small muted">#{n.ticketId.slice(0, 8)}</td>
                  <td>
                    <span className={`chip ${ESTADO_CHIP[n.estado]}`}>{n.estado}</span>
                  </td>
                  <td className="small muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.error ?? '—'}
                  </td>
                  <td className="muted small">{relativeTime(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
