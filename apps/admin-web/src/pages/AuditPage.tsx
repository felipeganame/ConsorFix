import { useEffect, useState } from 'react';
import { Topbar } from '../components/Shell.js';
import { listAudit, type AuditEntry } from '../lib/api.js';

const ENTIDAD_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  registro_conducta: 'Conducta',
  gasto: 'Gasto',
  consorcio: 'Consorcio',
  unidad: 'Unidad',
  residente: 'Vecino',
};

const ACCION_LABELS: Record<string, string> = {
  'ticket.validado': 'Validó',
  'ticket.solucionado': 'Resolvió',
  'ticket.descartado': 'Descartó',
  'conducta.aviso': 'Marcó aviso',
  'conducta.sancion': 'Marcó sanción',
  'conducta.descartado': 'Descartó conducta',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString('es-AR');
}

export function AuditPage(): JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [entidadFilter, setEntidadFilter] = useState<string>('');
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAudit({
      ...(entidadFilter && { entidad: entidadFilter }),
      days,
    })
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [entidadFilter, days]);

  return (
    <>
      <Topbar
        title="Bitácora"
        subtitle="Auditoría de acciones sensibles (RF-H05)"
      />
      <div className="content">
        <div className="filters-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="uppercase">Entidad</span>
            <div className="segment">
              {[
                { v: '', l: 'Todas' },
                { v: 'ticket', l: 'Tickets' },
                { v: 'registro_conducta', l: 'Conducta' },
                { v: 'gasto', l: 'Gastos' },
              ].map((o) => (
                <button
                  key={o.v || 'all'}
                  type="button"
                  className={entidadFilter === o.v ? 'on' : ''}
                  onClick={() => setEntidadFilter(o.v)}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="uppercase">Período</span>
            <div className="segment">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={days === d ? 'on' : ''}
                  onClick={() => setDays(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--cf-ink-3)' }}>{entries.length} eventos</span>
        </div>

        <section>
          {error && <div className="error">{error}</div>}
          {loading && <div className="muted">Cargando…</div>}
          {!loading && entries.length === 0 && (
            <div className="muted center" style={{ padding: '40px 0' }}>
              Sin eventos en el período.
            </div>
          )}
          <table className="grid">
            <thead>
              <tr>
                <th>Acción</th>
                <th>Entidad</th>
                <th>ID</th>
                <th>Actor</th>
                <th>Detalle</th>
                <th style={{ width: 120 }}>Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ cursor: 'default' }}>
                  <td>
                    <strong>{ACCION_LABELS[e.accion] ?? e.accion}</strong>
                  </td>
                  <td>{ENTIDAD_LABELS[e.entidad] ?? e.entidad}</td>
                  <td className="mono small muted">
                    {e.entidadId ? `#${e.entidadId.slice(0, 8)}` : '—'}
                  </td>
                  <td><span className="chip">{e.actorTipo}</span></td>
                  <td className="small muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.detalle ? JSON.stringify(e.detalle) : '—'}
                  </td>
                  <td className="muted small" title={new Date(e.at).toLocaleString('es-AR')}>
                    {relativeTime(e.at)}
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
