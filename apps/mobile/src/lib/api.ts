import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

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

const apiUrl = (): string => {
  const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  return fromExtra ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
};

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(t: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, t);
}
export async function clearSession(): Promise<void> {
  await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY)]);
}
export async function getUser(): Promise<SessionUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}
export async function setUser(u: SessionUser): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');
  const token = await getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(`${apiUrl()}${path}`, { ...init, headers });
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

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export type TicketEstado = 'REGISTRADO' | 'VALIDADO' | 'DESCARTADO' | 'SOLUCIONADO';
export type TicketUrgencia = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
export type TicketTipo = 'INFRAESTRUCTURA' | 'CONDUCTA';
export type TicketOrigen = 'UNIDAD' | 'ESPACIO_COMUN';

export interface FeedTicket {
  id: string;
  consorcioId: string;
  unidadId: string | null;
  tipo: TicketTipo;
  origen: TicketOrigen | null;
  urgencia: TicketUrgencia;
  estado: TicketEstado;
  titulo: string;
  descripcionNormalizada: string;
  votosCount: number;
  reportanteId: string | null;
  voted: boolean;
  createdAt: string;
  validatedAt: string | null;
  solucionadoAt: string | null;
}

export function listFeed(): Promise<FeedTicket[]> {
  return apiFetch<FeedTicket[]>('/me/tickets');
}

export interface Consorcio {
  id: string;
  nombre: string;
  tipo: 'EDIFICIO' | 'BARRIO' | 'OFICINAS';
}

// /me/tickets includes consorcio ids; we don't have an endpoint for residente
// to list their consorcios directly. Derive from feed for the New report screen.
export async function consorciosDelUsuario(): Promise<Array<{ id: string }>> {
  const feed = await listFeed();
  const ids = new Set(feed.map((t) => t.consorcioId));
  return Array.from(ids).map((id) => ({ id }));
}

export interface CreateTicketBody {
  consorcio_id: string;
  unidad_id?: string | null;
  tipo: TicketTipo;
  urgencia?: TicketUrgencia;
  origen_sugerido?: TicketOrigen;
  titulo: string;
  descripcion: string;
  client_generated_id: string;
}

export function createTicket(body: CreateTicketBody): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/tickets', { method: 'POST', body: JSON.stringify(body) });
}

export interface Ticket extends FeedTicket {
  tenantId: string;
}

export function getTicket(id: string): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}`);
}

export function vote(ticketId: string): Promise<{ ticketId: string; votosCount: number }> {
  return apiFetch<{ ticketId: string; votosCount: number }>(`/tickets/${ticketId}/votes`, {
    method: 'POST',
  });
}
export function unvote(ticketId: string): Promise<{ ticketId: string; votosCount: number }> {
  return apiFetch<{ ticketId: string; votosCount: number }>(`/tickets/${ticketId}/votes`, {
    method: 'DELETE',
  });
}

export function registerPushToken(token: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}
