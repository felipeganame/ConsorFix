import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import type { INestApplication } from '@nestjs/common';
import { and, eq, like, sql } from 'drizzle-orm';
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
    // El mock de WhatsApp responde bien, así que el reintento tiene éxito y la
    // fila sale de la cola. Eso es el comportamiento correcto: el reaper existe
    // para recuperar lo colgado, no para reintentar indefinidamente.
    expect(post.estado).toBe('ENVIADA');

    // Ahora el contador. El bug era que el catch del envío hacía `intentos: 1`
    // LITERAL, reseteando lo que el reaper acababa de incrementar: la fila
    // oscilaba entre 1 y 2, nunca alcanzaba el máximo y se reintentaba para
    // siempre, con costo por mensaje. Se simula el fallo devolviéndola a FALLIDA
    // y haciéndola elegible: el contador tiene que subir, no volver a 1.
    await systemDb
      .update(notificacion)
      .set({ estado: 'FALLIDA', proximoIntentoAt: new Date(Date.now() - 1000) })
      .where(eq(notificacion.id, n.id));
    await svc.reintentarPendientes(10);
    const post2 = (await systemDb.select().from(notificacion).where(eq(notificacion.id, n.id)))[0]!;
    expect(post2.intentos).toBe(2);

    // Y el backoff se agenda al futuro, así que una pasada inmediata no la toma.
    await systemDb.update(notificacion).set({ estado: 'FALLIDA' }).where(eq(notificacion.id, n.id));
    const r3 = await svc.reintentarPendientes(10);
    const post3 = (await systemDb.select().from(notificacion).where(eq(notificacion.id, n.id)))[0]!;
    expect(post3.intentos).toBe(2);
    expect(r3.reintentadas).toBe(0);

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

describe('regla 1 — la FK del consorcio no puede cruzar tenants', () => {
  it('un admin no puede crear un ticket apuntando al consorcio de otro tenant', async () => {
    // Este bug lo introdujo el cambio que habilitó al admin a crear tickets: al
    // saltear la validación de pertenencia junto con el reportanteId, quedó sin
    // chequear que el consorcio fuera del propio tenant.
    //
    // RLS no alcanza: filtra las filas por tenant_id, pero no valida que la FK
    // apunte dentro del mismo tenant. El ticket se creaba en el tenant del admin
    // apuntando al consorcio ajeno — base incoherente, y cualquier join
    // posterior expone el nombre del consorcio de otra administración.
    const ajeno = (
      await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}ajeno`, plan: 'basico' }).returning()
    )[0]!;
    const consAjeno = (
      await systemDb
        .insert(consorcio)
        .values({ tenantId: ajeno.id, nombre: `${PREFIX}cons-ajeno`, tipo: 'EDIFICIO' })
        .returning()
    )[0]!;

    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({
        consorcio_id: consAjeno.id,
        tipo: 'INFRAESTRUCTURA',
        titulo: `${PREFIX}intento cross-tenant`,
        descripcion: 'no debería entrar',
      }),
    });
    expect(res.status).toBe(404);

    // Y el invariante en la base: ningún ticket con FK cruzada.
    const incoherentes = await systemDb
      .select({ id: ticket.id })
      .from(ticket)
      .innerJoin(consorcio, eq(consorcio.id, ticket.consorcioId))
      .where(sql`${ticket.tenantId} <> ${consorcio.tenantId}`);
    expect(incoherentes).toHaveLength(0);
  });

  it('importar a un consorcio de otro tenant tampoco', async () => {
    const ajeno = (
      await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}ajeno2`, plan: 'basico' }).returning()
    )[0]!;
    const consAjeno = (
      await systemDb
        .insert(consorcio)
        .values({ tenantId: ajeno.id, nombre: `${PREFIX}cons-ajeno2`, tipo: 'EDIFICIO' })
        .returning()
    )[0]!;

    const res = await fetch(`${base}/import/residentes`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({
        consorcio_id: consAjeno.id,
        csv: 'nombre,telefono,unidad,rol\nIntruso Test,+5491199997777,1A,PROPIETARIO',
        dry_run: false,
        crear_unidades: true,
      }),
    });
    expect(res.status).toBe(404);

    const enAjeno = await systemDb
      .select({ id: residente.id })
      .from(residente)
      .where(eq(residente.tenantId, ajeno.id));
    expect(enAjeno).toHaveLength(0);
  });
});

describe('regla 1 — ninguna FK del ABM puede cruzar tenants', () => {
  // Estos tres eran bugs PREEXISTENTES, encontrados atacando el ABM después de
  // dar con el de POST /tickets. El patrón es siempre el mismo: RLS filtra las
  // filas por tenant_id, pero no valida que la FK apunte dentro del tenant, así
  // que la constraint se conforma con que el id exista en cualquier lado.
  let ajenoId: string;
  let consAjeno: { id: string };
  let resiAjeno: { id: string };
  let uniPropia: { id: string };

  beforeAll(async () => {
    const ajeno = (
      await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}fk-ajeno`, plan: 'basico' }).returning()
    )[0]!;
    ajenoId = ajeno.id;
    consAjeno = (
      await systemDb
        .insert(consorcio)
        .values({ tenantId: ajenoId, nombre: `${PREFIX}fk-cons`, tipo: 'EDIFICIO' })
        .returning()
    )[0]!;
    resiAjeno = (
      await systemDb
        .insert(residente)
        .values({
          tenantId: ajenoId,
          nombre: `${PREFIX}fk-resi`,
          telefonoE164: `+549${String(Date.now() + 31).slice(-9)}`,
        })
        .returning()
    )[0]!;
    uniPropia = (
      await systemDb
        .select({ id: unidad.id })
        .from(unidad)
        .where(and(eq(unidad.tenantId, ten.id), eq(unidad.consorcioId, cons.id)))
        .limit(1)
    )[0]! as { id: string };
  }, 30_000);

  it('no se puede crear una unidad en el consorcio de otro tenant', async () => {
    const res = await fetch(`${base}/unidades`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({ consorcio_id: consAjeno.id, etiqueta: 'INTRUSA' }),
    });
    expect(res.status).toBe(404);
  });

  it('tampoco en lote', async () => {
    const res = await fetch(`${base}/unidades/bulk`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({ consorcio_id: consAjeno.id, etiquetas: ['INTRUSA-1', 'INTRUSA-2'] }),
    });
    expect(res.status).toBe(404);
  });

  it('no se puede vincular un residente de otro tenant', async () => {
    // Este era el peor de los tres: el vínculo quedaba en el tenant propio
    // apuntando a un residente ajeno, y GET /vinculos exponía su id.
    const res = await fetch(`${base}/vinculos`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({ residente_id: resiAjeno.id, unidad_id: uniPropia.id, rol: 'INQUILINO' }),
    });
    expect(res.status).toBe(404);
  });

  it('el invariante se sostiene en toda la base', async () => {
    const cruces = await systemDb.execute(sql`
      SELECT count(*)::int AS n FROM (
        SELECT 1 FROM unidad u JOIN consorcio c ON c.id = u.consorcio_id WHERE u.tenant_id <> c.tenant_id
        UNION ALL
        SELECT 1 FROM vinculo_residente v JOIN unidad u ON u.id = v.unidad_id WHERE v.tenant_id <> u.tenant_id
        UNION ALL
        SELECT 1 FROM vinculo_residente v JOIN residente r ON r.id = v.residente_id WHERE v.tenant_id <> r.tenant_id
        UNION ALL
        SELECT 1 FROM ticket t JOIN consorcio c ON c.id = t.consorcio_id WHERE t.tenant_id <> c.tenant_id
      ) x
    `);
    const filas = (cruces as unknown as { rows?: Array<{ n: number }> }).rows ?? (cruces as unknown as Array<{ n: number }>);
    expect(Number(filas[0]!.n)).toBe(0);
  });
});
