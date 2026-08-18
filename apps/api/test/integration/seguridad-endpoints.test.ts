import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AppModule } from '../../src/app.module.js';
import { systemDb } from '../../src/db/client.js';
import {
  consorcio,
  gasto,
  residente,
  tenant as tenantTable,
  ticket,
  unidad,
  vinculoResidente,
} from '../../src/db/schema/index.js';

/**
 * Suite de seguridad row-level, **vía HTTP**.
 *
 * Los tests de fase5 llaman a los services directamente (`new MeService()`),
 * así que ningún guard de Nest se ejercita: por eso pasaban en verde mientras
 * tres endpoints devolvían datos privados a cualquier autenticado. Estos
 * tests levantan la app completa y pegan por HTTP, que es el único modo de
 * cubrir la cadena guard → controller → policy.
 *
 * Cada caso corresponde a un agujero reproducido en la auditoría del
 * 2026-08-17 contra el entorno local.
 */
const PREFIX = `sec_${Date.now()}_`;

let app: INestApplication;
let base: string;

let ten: { id: string };
let consA: { id: string }; // consorcio del residente
let consB: { id: string }; // consorcio ajeno
let uniA: { id: string };
let uniB: { id: string }; // unidad del consorcio ajeno
let ocupante: { id: string }; // vive en uniA
let denunciante: { id: string }; // vive en uniA y denuncia
let ticketConducta: { id: string };
let ticketAjeno: { id: string };
let ticketComun: { id: string };

// El login está rate-limited (y está bien que lo esté), así que se hace una
// sola vez en beforeAll y los tests reusan el token.
let tokenOcupante: string;
let refreshOcupante: string;

async function login(email: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234' }),
  });
  const body = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!body.accessToken || !body.refreshToken) {
    throw new Error(`login falló para ${email}: ${JSON.stringify(body)}`);
  }
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

// Hash Argon2id de 'test1234', para no depender del seed.
let passwordHash: string;

beforeAll(async () => {
  const { PasswordService } = await import('../../src/auth/password.service.js');
  passwordHash = await new PasswordService().hash('test1234');

  ten = (await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}t`, plan: 'basico' }).returning())[0]!;
  consA = (await systemDb.insert(consorcio).values({ tenantId: ten.id, nombre: `${PREFIX}A`, tipo: 'EDIFICIO' }).returning())[0]!;
  consB = (await systemDb.insert(consorcio).values({ tenantId: ten.id, nombre: `${PREFIX}B`, tipo: 'EDIFICIO' }).returning())[0]!;
  uniA = (await systemDb.insert(unidad).values({ tenantId: ten.id, consorcioId: consA.id, etiqueta: '4A' }).returning())[0]!;
  uniB = (await systemDb.insert(unidad).values({ tenantId: ten.id, consorcioId: consB.id, etiqueta: '9Z' }).returning())[0]!;

  const mk = async (slug: string) =>
    (
      await systemDb
        .insert(residente)
        .values({
          tenantId: ten.id,
          nombre: `${PREFIX}${slug}`,
          email: `${PREFIX}${slug}@test.dev`,
          passwordHash,
          telefonoE164: `+549${String(Date.now()).slice(-9)}${slug.length}`,
        })
        .returning()
    )[0]!;

  ocupante = await mk('ocupante');
  denunciante = await mk('denunciante');

  for (const r of [ocupante, denunciante]) {
    await systemDb.insert(vinculoResidente).values({
      tenantId: ten.id,
      residenteId: r.id,
      unidadId: uniA.id,
      rol: 'PROPIETARIO',
      activo: true,
    });
  }

  // Conducta contra la unidad del ocupante, reportada por el denunciante.
  // El ocupante DEBE ver el ticket, pero nunca al denunciante (RF-F02).
  ticketConducta = (
    await systemDb
      .insert(ticket)
      .values({
        tenantId: ten.id,
        consorcioId: consA.id,
        unidadId: uniA.id,
        reportanteId: denunciante.id,
        tipo: 'CONDUCTA',
        origen: 'UNIDAD',
        urgencia: 'MEDIA',
        estado: 'VALIDADO',
        titulo: `${PREFIX}ruidos`,
        descripcionNormalizada: 'ruidos molestos',
      })
      .returning()
  )[0]!;

  // Ticket de un consorcio donde el residente NO tiene vínculo.
  ticketAjeno = (
    await systemDb
      .insert(ticket)
      .values({
        tenantId: ten.id,
        consorcioId: consB.id,
        unidadId: uniB.id,
        tipo: 'INFRAESTRUCTURA',
        origen: 'UNIDAD',
        urgencia: 'ALTA',
        estado: 'VALIDADO',
        titulo: `${PREFIX}ajeno`,
        descripcionNormalizada: 'no debe verse',
      })
      .returning()
  )[0]!;
  await systemDb.insert(gasto).values({
    tenantId: ten.id,
    ticketId: ticketAjeno.id,
    descripcion: 'presupuesto tentativo',
    monto: '999999',
    moneda: 'ARS',
    estado: 'BORRADOR',
    comprobanteUrl: 'https://privado/comprobante.pdf',
  });

  // Espacio común del consorcio del residente, con un confirmado y un borrador.
  ticketComun = (
    await systemDb
      .insert(ticket)
      .values({
        tenantId: ten.id,
        consorcioId: consA.id,
        unidadId: null,
        tipo: 'INFRAESTRUCTURA',
        origen: 'ESPACIO_COMUN',
        urgencia: 'ALTA',
        estado: 'SOLUCIONADO',
        titulo: `${PREFIX}comun`,
        descripcionNormalizada: 'caño del palier',
      })
      .returning()
  )[0]!;
  await systemDb.insert(gasto).values([
    { tenantId: ten.id, ticketId: ticketComun.id, descripcion: 'arreglo', monto: '50000', moneda: 'ARS', estado: 'CONFIRMADO' },
    { tenantId: ten.id, ticketId: ticketComun.id, descripcion: 'tentativo', monto: '777777', moneda: 'ARS', estado: 'BORRADOR' },
  ]);

  app = await NestFactory.create(AppModule, { logger: false });
  app.use(json({ verify: (req, _res, buf) => { (req as unknown as { rawBody?: Buffer }).rawBody = buf; } }));
  await app.listen(0);
  base = await app.getUrl().then((u) => u.replace('[::1]', '127.0.0.1'));

  const sesion = await login(`${PREFIX}ocupante@test.dev`);
  tokenOcupante = sesion.accessToken;
  refreshOcupante = sesion.refreshToken;
}, 60_000);

afterAll(async () => {
  await app?.close();
  await systemDb.delete(tenantTable).where(eq(tenantTable.id, ten.id)); // cascade
});

describe('GET /tickets/:id — visibilidad row-level (RF-F02, RF-H03)', () => {
  it('no revela la identidad del denunciante al ocupante acusado', async () => {
    const res = await fetch(`${base}/tickets/${ticketConducta.id}`, { headers: auth(tokenOcupante) });
    expect(res.status).toBe(200);
    const t = (await res.json()) as { reportanteId: string | null; titulo: string };
    // Ve el ticket (es ocupante de la unidad reportada)...
    expect(t.titulo).toContain('ruidos');
    // ...pero jamás quién lo reportó.
    expect(t.reportanteId).toBeNull();
  });

  it('no deja leer un ticket de un consorcio donde no tiene vínculo', async () => {
    const res = await fetch(`${base}/tickets/${ticketAjeno.id}`, { headers: auth(tokenOcupante) });
    expect(res.status).toBe(404);
  });

  it('rechaza sin token', async () => {
    const res = await fetch(`${base}/tickets/${ticketComun.id}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /tickets/:id/gastos — G10 y borradores', () => {
  it('no expone gastos de un ticket de otro consorcio', async () => {
    const res = await fetch(`${base}/tickets/${ticketAjeno.id}/gastos`, { headers: auth(tokenOcupante) });
    expect(res.status).toBe(404);
  });

  it('en un espacio común muestra solo CONFIRMADO, nunca el borrador', async () => {
    const res = await fetch(`${base}/tickets/${ticketComun.id}/gastos`, { headers: auth(tokenOcupante) });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ estado: string }>;
    expect(rows).toHaveLength(1);
    expect(rows.every((g) => g.estado === 'CONFIRMADO')).toBe(true);
  });

  it('no expone el costo de un ticket de CONDUCTA aunque el ticket sea visible', async () => {
    const res = await fetch(`${base}/tickets/${ticketConducta.id}/gastos`, { headers: auth(tokenOcupante) });
    expect(res.status).toBe(404);
  });

  it('el total de un ticket ajeno tampoco se filtra', async () => {
    const res = await fetch(`${base}/tickets/${ticketAjeno.id}/gastos/total`, { headers: auth(tokenOcupante) });
    expect(res.status).toBe(404);
  });
});

describe('POST /tickets/:id/votes — las conductas no se votan', () => {
  it('el acusado no puede votar la denuncia hecha en su contra', async () => {
    const res = await fetch(`${base}/tickets/${ticketConducta.id}/votes`, {
      method: 'POST',
      headers: { ...auth(tokenOcupante), 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('un ticket de espacio común sí se vota', async () => {
    const res = await fetch(`${base}/tickets/${ticketComun.id}/votes`, {
      method: 'POST',
      headers: { ...auth(tokenOcupante), 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(201);
  });
});

describe('POST /tickets — pertenencia al consorcio (RF-H03)', () => {
  it('no permite crear un ticket en un consorcio ajeno', async () => {
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...auth(tokenOcupante), 'content-type': 'application/json' },
      body: JSON.stringify({
        consorcio_id: consB.id,
        tipo: 'INFRAESTRUCTURA',
        titulo: 'intento en consorcio ajeno',
        descripcion: 'no debería entrar',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('rechaza una unidad que no pertenece al consorcio indicado', async () => {
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...auth(tokenOcupante), 'content-type': 'application/json' },
      body: JSON.stringify({
        consorcio_id: consA.id,
        unidad_id: uniB.id,
        tipo: 'CONDUCTA',
        titulo: 'unidad cruzada',
        descripcion: 'no debería entrar',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('permite crear en el propio consorcio', async () => {
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...auth(tokenOcupante), 'content-type': 'application/json' },
      body: JSON.stringify({
        consorcio_id: consA.id,
        unidad_id: uniA.id,
        tipo: 'INFRAESTRUCTURA',
        titulo: 'reporte legítimo',
        descripcion: 'pérdida de agua',
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe('Tokens — un refresh no sirve como access (RF-H04)', () => {
  it('rechaza el refresh token en el header de autorización', async () => {
    expect(refreshOcupante).toBeTruthy();
    const abuso = await fetch(`${base}/tickets/${ticketComun.id}`, { headers: auth(refreshOcupante) });
    expect(abuso.status).toBe(401);
  });
});
