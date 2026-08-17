import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { systemDb } from '../../src/db/client.js';
import {
  consorcio,
  gasto,
  registroConducta,
  residente,
  tenant as tenantTable,
  ticket,
  unidad,
  vinculoResidente,
} from '../../src/db/schema/index.js';
import { MeService } from '../../src/me/me.service.js';
import { MetricsService } from '../../src/metrics/metrics.service.js';
import { HistorialConductaController } from '../../src/conducta/conducta.controller.js';
import type { AuthedRequest } from '../../src/auth/auth.guard.js';

// Fase 5: costos comunes visibles (RF-D05/E02/G10), métricas por consorcio
// (RF-D08) e historial de conducta por unidad (RF-F03). Data propia con
// prefijo único; cleanup por cascade del tenant.
const PREFIX = `int5_${Date.now()}_`;

let ten: { id: string };
let consA: { id: string }; // consorcio con tickets/costos
let consB: { id: string }; // consorcio "vacío" para probar filtro
let uniA: { id: string }; // unidad del residente
let resi: { id: string };
let ticketComun: { id: string };
let ticketUnidad: { id: string };
let ticketConducta: { id: string };

const adminReq = (tenantId: string): AuthedRequest =>
  ({ user: { sub: 'admin-test', kind: 'ADMIN', tid: tenantId }, headers: {} }) as unknown as AuthedRequest;

beforeAll(async () => {
  ten = (await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}t`, plan: 'basico' }).returning())[0]!;
  consA = (await systemDb.insert(consorcio).values({ tenantId: ten.id, nombre: `${PREFIX}A`, tipo: 'EDIFICIO' }).returning())[0]!;
  consB = (await systemDb.insert(consorcio).values({ tenantId: ten.id, nombre: `${PREFIX}B`, tipo: 'EDIFICIO' }).returning())[0]!;
  uniA = (await systemDb.insert(unidad).values({ tenantId: ten.id, consorcioId: consA.id, etiqueta: '4A' }).returning())[0]!;
  resi = (await systemDb.insert(residente).values({ tenantId: ten.id, nombre: `${PREFIX}resi`, telefonoE164: `+5491${Date.now() % 100000000}` }).returning())[0]!;
  await systemDb.insert(vinculoResidente).values({ tenantId: ten.id, residenteId: resi.id, unidadId: uniA.id, rol: 'PROPIETARIO', activo: true });

  // Ticket común con gasto confirmado (visible + costo visible).
  ticketComun = (await systemDb.insert(ticket).values({
    tenantId: ten.id, consorcioId: consA.id, unidadId: null,
    tipo: 'INFRAESTRUCTURA', urgencia: 'ALTA', estado: 'SOLUCIONADO',
    origen: 'ESPACIO_COMUN', titulo: `${PREFIX}comun`, descripcionNormalizada: 'caño palier',
  }).returning())[0]!;
  await systemDb.insert(gasto).values([
    { tenantId: ten.id, ticketId: ticketComun.id, descripcion: 'reparacion', monto: '60000', moneda: 'ARS', estado: 'CONFIRMADO' },
    { tenantId: ten.id, ticketId: ticketComun.id, descripcion: 'mano de obra', monto: '25000', moneda: 'ARS', estado: 'CONFIRMADO' },
    { tenantId: ten.id, ticketId: ticketComun.id, descripcion: 'borrador no confirmado', monto: '999999', moneda: 'ARS', estado: 'BORRADOR' },
  ]);

  // Ticket de UNIDAD del residente, con gasto confirmado: visible al ocupante
  // PERO su costo es privado (no debe aparecer en el feed).
  ticketUnidad = (await systemDb.insert(ticket).values({
    tenantId: ten.id, consorcioId: consA.id, unidadId: uniA.id,
    tipo: 'INFRAESTRUCTURA', urgencia: 'MEDIA', estado: 'SOLUCIONADO',
    origen: 'UNIDAD', titulo: `${PREFIX}unidad`, descripcionNormalizada: 'canilla unidad',
  }).returning())[0]!;
  await systemDb.insert(gasto).values({ tenantId: ten.id, ticketId: ticketUnidad.id, descripcion: 'plomero', monto: '12000', moneda: 'ARS', estado: 'CONFIRMADO' });

  // Ticket de CONDUCTA contra la unidad del residente, con avisos/sanciones.
  ticketConducta = (await systemDb.insert(ticket).values({
    tenantId: ten.id, consorcioId: consA.id, unidadId: uniA.id, reportanteId: resi.id,
    tipo: 'CONDUCTA', urgencia: 'MEDIA', estado: 'VALIDADO',
    origen: null, titulo: `${PREFIX}conducta`, descripcionNormalizada: 'ruidos',
  }).returning())[0]!;
  await systemDb.insert(registroConducta).values([
    { tenantId: ten.id, unidadId: uniA.id, ticketId: ticketConducta.id, resultado: 'AVISO', detalle: 'primer aviso' },
    { tenantId: ten.id, unidadId: uniA.id, ticketId: ticketConducta.id, resultado: 'SANCION', detalle: 'multa' },
  ]);
});

afterAll(async () => {
  await systemDb.delete(tenantTable).where(eq(tenantTable.id, ten.id));
});

describe('Feed del residente — costos visibles (RF-D05/E02/G10)', () => {
  it('expone el costo confirmado del ticket de espacio común (suma sólo CONFIRMADO)', async () => {
    const feed = await new MeService().listFeed(ten.id, resi.id);
    const comun = feed.find((t) => t.id === ticketComun.id);
    expect(comun).toBeDefined();
    // 60000 + 25000 = 85000; el BORRADOR (999999) NO se cuenta.
    expect(comun!.costosConfirmados).toEqual([{ moneda: 'ARS', total: 85000 }]);
  });

  it('NO expone el costo de un ticket de UNIDAD (privado), aunque el ocupante vea el ticket', async () => {
    const feed = await new MeService().listFeed(ten.id, resi.id);
    const u = feed.find((t) => t.id === ticketUnidad.id);
    expect(u).toBeDefined(); // el ocupante VE el ticket
    expect(u!.costosConfirmados).toBeNull(); // pero NO el costo
  });

  it('oculta la identidad del reportante en tickets de conducta (RF-F02)', async () => {
    const feed = await new MeService().listFeed(ten.id, resi.id);
    const c = feed.find((t) => t.id === ticketConducta.id);
    expect(c).toBeDefined();
    expect(c!.reportanteId).toBeNull();
    expect(c!.costosConfirmados).toBeNull();
  });
});

describe('Métricas — costos por consorcio (RF-D08)', () => {
  it('suma costos confirmados del consorcio con gastos', async () => {
    const m = await new MetricsService().overview(ten.id, consA.id);
    // común (85000) + unidad (12000) = 97000, ambos en consorcio A.
    expect(m.costosConfirmados).toEqual([{ moneda: 'ARS', total: 97000 }]);
  });

  it('devuelve [] para un consorcio sin gastos (el filtro por consorcio funciona)', async () => {
    const m = await new MetricsService().overview(ten.id, consB.id);
    expect(m.costosConfirmados).toEqual([]);
  });
});

describe('Historial de conducta por unidad (RF-F03)', () => {
  it('lista todos los avisos/sanciones de la unidad con contexto del ticket', async () => {
    const rows = await new HistorialConductaController().list(adminReq(ten.id), uniA.id);
    expect(rows).toHaveLength(2);
    const resultados = rows.map((r) => r.resultado).sort();
    expect(resultados).toEqual(['AVISO', 'SANCION']);
    expect(rows[0]!.ticketTitulo).toContain('conducta');
  });

  it('una unidad sin registros devuelve lista vacía', async () => {
    const otra = (await systemDb.insert(unidad).values({ tenantId: ten.id, consorcioId: consB.id, etiqueta: '1B' }).returning())[0]!;
    const rows = await new HistorialConductaController().list(adminReq(ten.id), otra.id);
    expect(rows).toHaveLength(0);
  });
});
