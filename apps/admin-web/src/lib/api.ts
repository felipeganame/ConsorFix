export type UserKind = 'SUPER_ADMIN' | 'ADMIN' | 'RESIDENTE';

export interface SessionUser {
  id: string;
  kind: UserKind;
  tenantId: string | null;
  nombre: string;
  email: string;
}

const TOKEN_KEY = 'cfx.token';
const USER_KEY = 'cfx.user';
const TENANT_KEY = 'cfx.tenant';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string): void {
  sessionStorage.setItem(TOKEN_KEY, t);
}
export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TENANT_KEY);
}
export function getUser(): SessionUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}
export function setUser(u: SessionUser): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(u));
}
export function getTenantOverride(): string | null {
  return sessionStorage.getItem(TENANT_KEY);
}
export function setTenantOverride(t: string): void {
  sessionStorage.setItem(TENANT_KEY, t);
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const user = getUser();
  const tenantOverride = getTenantOverride();
  if (user?.kind === 'SUPER_ADMIN' && tenantOverride) headers.set('x-tenant-id', tenantOverride);
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || j.message || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export interface Consorcio {
  id: string;
  tenantId: string;
  nombre: string;
  tipo: 'EDIFICIO' | 'BARRIO' | 'OFICINAS';
  direccion: string | null;
  archivado: boolean;
  createdAt: string;
}

export interface Unidad {
  id: string;
  tenantId: string;
  consorcioId: string;
  etiqueta: string;
  createdAt: string;
}

export interface Residente {
  id: string;
  nombre: string;
  telefonoE164: string;
  email: string | null;
  activo: boolean;
}

export interface Vinculo {
  id: string;
  tenantId: string;
  residenteId: string;
  unidadId: string;
  rol: 'PROPIETARIO' | 'INQUILINO';
  activo: boolean;
  createdAt: string;
}

export type TicketEstado = 'REGISTRADO' | 'VALIDADO' | 'DESCARTADO' | 'SOLUCIONADO';
export type TicketUrgencia = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
export type TicketOrigen = 'UNIDAD' | 'ESPACIO_COMUN';
export type TicketTipo = 'INFRAESTRUCTURA' | 'CONDUCTA';

export interface Ticket {
  id: string;
  tenantId: string;
  consorcioId: string;
  unidadId: string | null;
  reportanteId: string | null;
  tipo: TicketTipo;
  origen: TicketOrigen | null;
  urgencia: TicketUrgencia;
  estado: TicketEstado;
  titulo: string;
  descripcionNormalizada: string;
  votosCount: number;
  categoriaId: string | null;
  createdAt: string;
  validatedAt: string | null;
  solucionadoAt: string | null;
  updatedAt: string;
}

export function listConsorcios(): Promise<Consorcio[]> {
  return apiFetch<Consorcio[]>('/consorcios');
}
export function createConsorcio(body: {
  nombre: string;
  tipo: Consorcio['tipo'];
  direccion?: string;
}): Promise<Consorcio> {
  return apiFetch<Consorcio>('/consorcios', { method: 'POST', body: JSON.stringify(body) });
}

export function listUnidades(consorcioId?: string): Promise<Unidad[]> {
  const q = consorcioId ? `?consorcio_id=${encodeURIComponent(consorcioId)}` : '';
  return apiFetch<Unidad[]>(`/unidades${q}`);
}
export function createUnidad(body: { consorcio_id: string; etiqueta: string }): Promise<Unidad> {
  return apiFetch<Unidad>('/unidades', { method: 'POST', body: JSON.stringify(body) });
}

export function listResidentes(): Promise<Residente[]> {
  return apiFetch<Residente[]>('/residentes');
}
export function createResidente(body: {
  nombre: string;
  telefono_e164: string;
  email?: string;
  password?: string;
}): Promise<Residente> {
  return apiFetch<Residente>('/residentes', { method: 'POST', body: JSON.stringify(body) });
}

export function listVinculos(unidadId: string): Promise<Vinculo[]> {
  return apiFetch<Vinculo[]>(`/vinculos?unidad_id=${encodeURIComponent(unidadId)}`);
}
export function createVinculo(body: {
  residente_id: string;
  unidad_id: string;
  rol: 'PROPIETARIO' | 'INQUILINO';
}): Promise<Vinculo> {
  return apiFetch<Vinculo>('/vinculos', { method: 'POST', body: JSON.stringify(body) });
}
export function desvincular(vinculoId: string): Promise<Vinculo> {
  return apiFetch<Vinculo>(`/vinculos/${vinculoId}`, {
    method: 'PATCH',
    body: JSON.stringify({ activo: false }),
  });
}

export function listTickets(filters: {
  consorcio_id?: string;
  estado?: TicketEstado;
} = {}): Promise<Ticket[]> {
  const q = new URLSearchParams();
  if (filters.consorcio_id) q.set('consorcio_id', filters.consorcio_id);
  if (filters.estado) q.set('estado', filters.estado);
  const qs = q.toString();
  return apiFetch<Ticket[]>(`/tickets${qs ? `?${qs}` : ''}`);
}
export function getTicket(id: string): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}`);
}
export function transitionTicket(
  id: string,
  body: { to: TicketEstado; origen?: TicketOrigen; categoria_id?: string; nota?: string },
): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}/transitions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface Gasto {
  id: string;
  tenantId: string;
  ticketId: string;
  descripcion: string;
  monto: string;
  moneda: string;
  comprobanteUrl: string | null;
  estado: 'BORRADOR' | 'CONFIRMADO';
  cargadoPorId: string | null;
  createdAt: string;
}

export function listGastos(ticketId: string): Promise<Gasto[]> {
  return apiFetch<Gasto[]>(`/tickets/${ticketId}/gastos`);
}
export function totalGastos(ticketId: string): Promise<Array<{ moneda: string; total: number }>> {
  return apiFetch<Array<{ moneda: string; total: number }>>(`/tickets/${ticketId}/gastos/total`);
}
export function createGasto(
  ticketId: string,
  body: {
    descripcion: string;
    monto: number;
    moneda?: string;
    comprobante_url?: string;
    estado?: 'BORRADOR' | 'CONFIRMADO';
  },
): Promise<Gasto> {
  return apiFetch<Gasto>(`/tickets/${ticketId}/gastos`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface MetricsOverview {
  byEstado: Array<{ estado: TicketEstado; count: number }>;
  byUrgencia: Array<{ urgencia: TicketUrgencia; count: number }>;
  avgResolutionMinutes: number | string | null;
  costosConfirmados: Array<{ moneda: string; total: number }>;
}

export function getMetrics(consorcioId?: string): Promise<MetricsOverview> {
  const q = consorcioId ? `?consorcio_id=${encodeURIComponent(consorcioId)}` : '';
  return apiFetch<MetricsOverview>(`/admin/metrics${q}`);
}

export interface AuditEntry {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorTipo: 'ADMIN' | 'SUPER_ADMIN' | 'SISTEMA';
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle: Record<string, unknown> | null;
  at: string;
}

export function listAudit(q: { entidad?: string; accion?: string; days?: number } = {}): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (q.entidad) params.set('entidad', q.entidad);
  if (q.accion) params.set('accion', q.accion);
  if (q.days) params.set('days', String(q.days));
  const qs = params.toString();
  return apiFetch<AuditEntry[]>(`/admin/audit-log${qs ? `?${qs}` : ''}`);
}

export interface NotifEntry {
  id: string;
  ticketId: string;
  destinatarioId: string;
  destinatarioTipo: string;
  canal: 'WHATSAPP' | 'PUSH' | 'EMAIL';
  plantilla: string;
  estado: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA';
  intentos: number;
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listNotifs(q: { ticket_id?: string } = {}): Promise<NotifEntry[]> {
  const params = new URLSearchParams();
  if (q.ticket_id) params.set('ticket_id', q.ticket_id);
  const qs = params.toString();
  return apiFetch<NotifEntry[]>(`/admin/notificaciones${qs ? `?${qs}` : ''}`);
}

export interface SimilarTicket {
  id: string;
  titulo: string;
  estado: string;
  similarity: number;
  created_at: string;
}
export function listSimilar(ticketId: string): Promise<SimilarTicket[]> {
  return apiFetch<SimilarTicket[]>(`/tickets/${ticketId}/similar`);
}
