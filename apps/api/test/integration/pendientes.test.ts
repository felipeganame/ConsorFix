import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import type { INestApplication } from '@nestjs/common';
import { and, eq, like } from 'drizzle-orm';
import { AppModule } from '../../src/app.module.js';
import { systemDb } from '../../src/db/client.js';
import {
  consorcio,
  residente,
  tenant as tenantTable,
  ticket,
  notificacion,
  unidad,
  usuarioAdmin,
  vinculoResidente,
} from '../../src/db/schema/index.js';
import { PasswordService } from '../../src/auth/password.service.js';

/**
 * RF-A01 (crear administración), RF-A05 (importación masiva) y el criterio de
 * salida de la Fase 1 (un admin puede crear un ticket manual).
 *
 * Vía HTTP, con la app completa: los tres dependen de guards de rol, que es
 * justo lo que no se ejercita llamando a los servicios directamente.
 */
const PREFIX = `pend_${Date.now()}_`;

let app: INestApplication;
let base: string;
let ten: { id: string };
let cons: { id: string };
let tokenAdmin: string;
let tokenSuper: string;
let tokenResi: string;

async function login(email: string, password = 'test1234'): Promise<string> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) throw new Error(`login falló para ${email}: ${JSON.stringify(body)}`);
  return body.accessToken;
}

const auth = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

beforeAll(async () => {
  const hash = await new PasswordService().hash('test1234');

  ten = (await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}t`, plan: 'basico' }).returning())[0]!;
  cons = (
    await systemDb.insert(consorcio).values({ tenantId: ten.id, nombre: `${PREFIX}c`, tipo: 'EDIFICIO' }).returning()
  )[0]!;
  await systemDb.insert(unidad).values({ tenantId: ten.id, consorcioId: cons.id, etiqueta: '1A' });

  await systemDb.insert(usuarioAdmin).values({
    tenantId: ten.id,
    nombre: `${PREFIX}admin`,
    email: `${PREFIX}admin@test.dev`,
    passwordHash: hash,
    rol: 'ADMIN',
  });
  await systemDb.insert(usuarioAdmin).values({
    tenantId: null,
    nombre: `${PREFIX}super`,
    email: `${PREFIX}super@test.dev`,
    passwordHash: hash,
    rol: 'SUPER_ADMIN',
  });
  const resi = (
    await systemDb
      .insert(residente)
      .values({
        tenantId: ten.id,
        nombre: `${PREFIX}resi`,
        email: `${PREFIX}resi@test.dev`,
        passwordHash: hash,
        telefonoE164: `+549${String(Date.now()).slice(-9)}`,
      })
      .returning()
  )[0]!;
  const uni = (
    await systemDb
      .select({ id: unidad.id })
      .from(unidad)
      .where(and(eq(unidad.tenantId, ten.id), eq(unidad.consorcioId, cons.id)))
      .limit(1)
  )[0]!;
  await systemDb.insert(vinculoResidente).values({
    tenantId: ten.id,
    residenteId: resi.id,
    unidadId: uni.id,
    rol: 'PROPIETARIO',
    activo: true,
  });

  app = await NestFactory.create(AppModule, { logger: false });
  app.use(json({ verify: (req, _res, buf) => { (req as unknown as { rawBody?: Buffer }).rawBody = buf; } }));
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  tokenAdmin = await login(`${PREFIX}admin@test.dev`);
  tokenSuper = await login(`${PREFIX}super@test.dev`);
  tokenResi = await login(`${PREFIX}resi@test.dev`);
}, 90_000);

afterAll(async () => {
  await app?.close();
  await systemDb.delete(tenantTable).where(like(tenantTable.nombre, `${PREFIX}%`));
  await systemDb.delete(usuarioAdmin).where(like(usuarioAdmin.email, `${PREFIX}%`));
});

describe('RF-A01 — crear administración', () => {
  it('un SUPER_ADMIN la crea junto con su primer admin', async () => {
    const email = `${PREFIX}nuevo@test.dev`;
    const res = await fetch(`${base}/tenants`, {
      method: 'POST',
      headers: auth(tokenSuper),
      body: JSON.stringify({
        nombre: `${PREFIX}nueva-admin`,
        admin: { nombre: 'Admin Nuevo', email, password: 'clave-larga-1234' },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; admin: { email: string } };
    expect(body.id).toBeTruthy();
    expect(body.admin.email).toBe(email);

    // El punto de crearlos juntos: que el admin pueda entrar de una.
    const token = await login(email, 'clave-larga-1234');
    expect(token.length).toBeGreaterThan(20);
  });

  it('un ADMIN común no puede', async () => {
    const res = await fetch(`${base}/tenants`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({
        nombre: 'x',
        admin: { nombre: 'y', email: `${PREFIX}z@test.dev`, password: 'clave-larga-1234' },
      }),
    });
    expect(res.status).toBe(403);
  });

  it('rechaza un email de admin ya usado', async () => {
    const res = await fetch(`${base}/tenants`, {
      method: 'POST',
      headers: auth(tokenSuper),
      body: JSON.stringify({
        nombre: `${PREFIX}otra`,
        admin: { nombre: 'dup', email: `${PREFIX}admin@test.dev`, password: 'clave-larga-1234' },
      }),
    });
    expect(res.status).toBe(409);
  });
});

describe('Fase 1 — un admin puede crear un ticket manual', () => {
  it('crea el ticket y queda sin reportante', async () => {
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({
        consorcio_id: cons.id,
        tipo: 'INFRAESTRUCTURA',
        urgencia: 'ALTA',
        titulo: `${PREFIX}reporte telefónico`,
        descripcion: 'un vecino llamó por teléfono',
      }),
    });
    expect(res.status).toBe(201);
    const t = (await res.json()) as { id: string; reportanteId: string | null; estado: string };
    expect(t.estado).toBe('REGISTRADO');
    // No hay residente que haya reportado: lo cargó el admin.
    expect(t.reportanteId).toBeNull();
  });
});

describe('RF-A05 — importación masiva de residentes', () => {
  const csv = [
    'Nombre,Teléfono,Email,Depto,Vínculo',
    'Ana Test,+5491199990001,ana@test.dev,1A,PROPIETARIO',
    'Beto Test,+5491199990002,,1A,inquilino',
    'Mal Telefono,123,x@test.dev,1A,PROPIETARIO',
    'Rol Invalido,+5491199990003,,1A,DUEÑO',
    'Unidad Fantasma,+5491199990004,,9Z,PROPIETARIO',
    'Ana Repetida,+5491199990001,otra@test.dev,1A,INQUILINO',
  ].join('\n');

  it('reporta cada fila inválida con su motivo y su número real', async () => {
    const res = await fetch(`${base}/import/residentes`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({ consorcio_id: cons.id, csv, dry_run: true }),
    });
    expect(res.status).toBe(201);
    const r = (await res.json()) as {
      totalFilas: number;
      validas: number;
      insertadas: number;
      errores: Array<{ fila: number; motivo: string }>;
    };

    expect(r.totalFilas).toBe(6);
    expect(r.insertadas).toBe(0); // dry run no escribe
    const porFila = new Map(r.errores.map((e) => [e.fila, e.motivo]));

    // El número de fila cuenta el encabezado: Ana es la 2.
    expect(porFila.get(4)).toMatch(/E\.164/);
    expect(porFila.get(5)).toMatch(/PROPIETARIO o INQUILINO/);
    // La unidad se valida en una segunda pasada contra la base; el número de
    // fila tiene que seguir siendo el original y no el índice de las válidas.
    expect(porFila.get(6)).toMatch(/no existe en el consorcio/);
    expect(porFila.get(7)).toMatch(/repetido en el archivo/);
  });

  it('inserta las válidas y crea las unidades cuando se pide', async () => {
    const res = await fetch(`${base}/import/residentes`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({ consorcio_id: cons.id, csv, dry_run: false, crear_unidades: true }),
    });
    expect(res.status).toBe(201);
    const r = (await res.json()) as { insertadas: number; unidadesCreadas: string[] };
    expect(r.insertadas).toBe(3); // Ana, Beto y el de la unidad fantasma
    expect(r.unidadesCreadas).toContain('9Z');

    const cargados = await systemDb
      .select({ nombre: residente.nombre })
      .from(residente)
      .where(and(eq(residente.tenantId, ten.id), like(residente.telefonoE164, '+54911999900%')));
    expect(cargados.length).toBe(3);
  });

  it('un residente no puede importar', async () => {
    const res = await fetch(`${base}/import/residentes`, {
      method: 'POST',
      headers: auth(tokenResi),
      body: JSON.stringify({ consorcio_id: cons.id, csv: 'nombre\nx', dry_run: true }),
    });
    expect(res.status).toBe(403);
  });

  it('404 si el consorcio no existe', async () => {
    const res = await fetch(`${base}/import/residentes`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({
        consorcio_id: '00000000-0000-4000-8000-000000000000',
        csv: 'nombre,telefono,unidad,rol\nValido Nombre,+5491199991111,1A,PROPIETARIO',
        dry_run: true,
      }),
    });
    expect(res.status).toBe(404);
  });
});

void ticket;

describe('RF-G01/G02 — notificaciones durables y ventana de 24 h', () => {
  it('el reaper reintenta lo que quedó colgado y respeta el backoff', async () => {
    const { NotificationsService } = await import('../../src/notifications/notifications.service.js');
    const svc = new NotificationsService();

    const uni = (
      await systemDb
        .select({ id: unidad.id })
        .from(unidad)
        .where(and(eq(unidad.tenantId, ten.id), eq(unidad.consorcioId, cons.id)))
        .limit(1)
    )[0]!;
    const resi = (
      await systemDb
        .insert(residente)
        .values({
          tenantId: ten.id,
          nombre: `${PREFIX}notif`,
          telefonoE164: `+549${String(Date.now() + 7).slice(-9)}`,
        })
        .returning()
    )[0]!;
    await systemDb.insert(vinculoResidente).values({
      tenantId: ten.id, residenteId: resi.id, unidadId: uni.id, rol: 'PROPIETARIO', activo: true,
    });
    const tk = (
      await systemDb
        .insert(ticket)
        .values({
          tenantId: ten.id, consorcioId: cons.id, unidadId: uni.id, reportanteId: resi.id,
          tipo: 'INFRAESTRUCTURA', origen: 'ESPACIO_COMUN', urgencia: 'MEDIA', estado: 'VALIDADO',
          titulo: `${PREFIX}notif`, descripcionNormalizada: 'x',
        })
        .returning()
    )[0]!;

    // Una notificación que quedó PENDIENTE, como si el proceso hubiera muerto
    // en medio del envío. Antes del reaper esto se quedaba así para siempre.
    const n = (
      await systemDb
        .insert(notificacion)
        .values({
          tenantId: ten.id, ticketId: tk.id, destinatarioId: resi.id,
          destinatarioTipo: 'RESIDENTE', canal: 'WHATSAPP',
          plantilla: 'ticket_actualizacion', estado: 'PENDIENTE',
        })
        .returning()
    )[0]!;

    const r1 = await svc.reintentarPendientes(10);
    expect(r1.reintentadas).toBeGreaterThanOrEqual(1);

    const post = (
      await systemDb.select().from(notificacion).where(eq(notificacion.id, n.id))
    )[0]!;
    expect(post.intentos).toBe(1);
    expect(post.proximoIntentoAt).not.toBeNull();
    // El backoff se agenda al futuro: una segunda pasada no la vuelve a tomar.
    expect(post.proximoIntentoAt!.getTime()).toBeGreaterThan(Date.now());

    const r2 = await svc.reintentarPendientes(10);
    const tomadaDeNuevo = r2.reintentadas > 0;
    if (tomadaDeNuevo) {
      const post2 = (await systemDb.select().from(notificacion).where(eq(notificacion.id, n.id)))[0]!;
      expect(post2.intentos).toBe(1); // no fue esta la que se volvió a tomar
    }

    svc.onModuleDestroy();
  });

  it('la ventana de 24 h se abre con el inbound y no antes', async () => {
    const { NotificationsService } = await import('../../src/notifications/notifications.service.js');
    const svc = new NotificationsService();
    const resi = (
      await systemDb
        .insert(residente)
        .values({
          tenantId: ten.id,
          nombre: `${PREFIX}ventana`,
          telefonoE164: `+549${String(Date.now() + 11).slice(-9)}`,
        })
        .returning()
    )[0]!;

    // Sin inbound registrado: fuera de la ventana, hay que usar plantilla.
    expect(await svc.dentroDeVentana24h(resi.id)).toBe(false);

    await svc.registrarInbound(resi.id);
    expect(await svc.dentroDeVentana24h(resi.id)).toBe(true);

    // Un inbound de hace 25 horas ya no cuenta.
    await systemDb
      .update(residente)
      .set({ ultimoInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(residente.id, resi.id));
    expect(await svc.dentroDeVentana24h(resi.id)).toBe(false);

    svc.onModuleDestroy();
  });
});
