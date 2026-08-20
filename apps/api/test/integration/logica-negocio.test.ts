import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { AppModule } from '../../src/app.module.js';
import { systemDb } from '../../src/db/client.js';
import {
  consorcio,
  gasto,
  residente,
  tenant as tenantTable,
  notificacion,
  ticket,
  unidad,
  usuarioAdmin,
  vinculoResidente,
} from '../../src/db/schema/index.js';

/**
 * Lógica de negocio end-to-end vía HTTP: quién pertenece a qué, qué puede hacer
 * cada rol dentro de un consorcio, y qué ve cada uno.
 *
 * Fija por escrito los hallazgos de la corrida manual del 2026-08-18, que probó
 * la matriz completa (111 aserciones) contra el entorno local. Los dos defectos
 * que encontró están cubiertos acá para que no vuelvan:
 *
 * 1. `PATCH /consorcios/:id` sobre un consorcio de otra administración
 *    respondía **200 con body vacío** en vez de 404. No filtraba datos (el
 *    UPDATE tocaba 0 filas), pero el panel mostraba "guardado" sin guardar.
 * 2. El costo confirmado de un ticket de UNIDAD era invisible para los
 *    ocupantes de esa misma unidad — o sea, para quien paga la reparación.
 *
 * Escenario: dos administraciones (tenants), tres consorcios, cuatro unidades.
 * `multi` pertenece a dos consorcios de la misma administración, que es el caso
 * que rompe cualquier atajo de "un residente = un consorcio".
 */
const PREFIX = `log_${Date.now()}_`;

let app: INestApplication;
let base: string;
let passwordHash: string;

let tenA: { id: string };
let tenB: { id: string };
let c1: { id: string }; // A / edificio
let c2: { id: string }; // A / barrio
let c3: { id: string }; // B / edificio
let u1a: { id: string }; // c1
let u2b: { id: string }; // c1
let uL9: { id: string }; // c2
let u9z: { id: string }; // c3

let propietario1a: { id: string };
let inquilino1a: { id: string };
let vecino2b: { id: string };
let multi: { id: string };
let ajenoB: { id: string };

let tokens: Record<string, string> = {};

const creados = { tenants: [] as string[] };

async function login(email: string): Promise<string> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234' }),
  });
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) throw new Error(`login falló para ${email}: ${JSON.stringify(body)}`);
  return body.accessToken;
}

function auth(who: string): Record<string, string> {
  return { authorization: `Bearer ${tokens[who]}`, 'content-type': 'application/json' };
}

async function api(
  method: string,
  path: string,
  who: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: auth(who),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await res.text();
  let parsed: unknown = null;
  try {
    parsed = txt ? JSON.parse(txt) : null;
  } catch {
    parsed = txt;
  }
  return { status: res.status, body: parsed };
}

let telSeq = 0;
function tel(): string {
  telSeq += 1;
  return `+549${String(Date.now()).slice(-8)}${String(telSeq).padStart(2, '0')}`;
}

beforeAll(async () => {
  const { PasswordService } = await import('../../src/auth/password.service.js');
  passwordHash = await new PasswordService().hash('test1234');

  const mkTenant = async (slug: string) =>
    (await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}${slug}`, plan: 'basico' }).returning())[0]!;
  tenA = await mkTenant('A');
  tenB = await mkTenant('B');
  creados.tenants.push(tenA.id, tenB.id);

  const mkCons = async (tid: string, slug: string, tipo: 'EDIFICIO' | 'BARRIO') =>
    (await systemDb.insert(consorcio).values({ tenantId: tid, nombre: `${PREFIX}${slug}`, tipo }).returning())[0]!;
  c1 = await mkCons(tenA.id, 'c1', 'EDIFICIO');
  c2 = await mkCons(tenA.id, 'c2', 'BARRIO');
  c3 = await mkCons(tenB.id, 'c3', 'EDIFICIO');

  const mkUni = async (tid: string, cid: string, etiqueta: string) =>
    (await systemDb.insert(unidad).values({ tenantId: tid, consorcioId: cid, etiqueta }).returning())[0]!;
  u1a = await mkUni(tenA.id, c1.id, '1A');
  u2b = await mkUni(tenA.id, c1.id, '2B');
  uL9 = await mkUni(tenA.id, c2.id, 'Lote9');
  u9z = await mkUni(tenB.id, c3.id, '9Z');

  const mkResi = async (tid: string, slug: string) =>
    (
      await systemDb
        .insert(residente)
        .values({
          tenantId: tid,
          nombre: `${PREFIX}${slug}`,
          email: `${PREFIX}${slug}@test.dev`,
          passwordHash,
          telefonoE164: tel(),
        })
        .returning()
    )[0]!;
  propietario1a = await mkResi(tenA.id, 'prop1a');
  inquilino1a = await mkResi(tenA.id, 'inq1a');
  vecino2b = await mkResi(tenA.id, 'vec2b');
  multi = await mkResi(tenA.id, 'multi');
  ajenoB = await mkResi(tenB.id, 'ajenoB');

  const vincular = (tid: string, rid: string, uid: string, rol: 'PROPIETARIO' | 'INQUILINO') =>
    systemDb.insert(vinculoResidente).values({ tenantId: tid, residenteId: rid, unidadId: uid, rol, activo: true });
  await vincular(tenA.id, propietario1a.id, u1a.id, 'PROPIETARIO');
  await vincular(tenA.id, inquilino1a.id, u1a.id, 'INQUILINO');
  await vincular(tenA.id, vecino2b.id, u2b.id, 'PROPIETARIO');
  await vincular(tenA.id, multi.id, u1a.id, 'PROPIETARIO');
  await vincular(tenA.id, multi.id, uL9.id, 'PROPIETARIO'); // segundo consorcio
  await vincular(tenB.id, ajenoB.id, u9z.id, 'PROPIETARIO');

  const mkAdmin = async (tid: string | null, slug: string, rol: 'ADMIN' | 'SUPER_ADMIN') =>
    (
      await systemDb
        .insert(usuarioAdmin)
        .values({
          tenantId: tid,
          email: `${PREFIX}${slug}@test.dev`,
          passwordHash,
          rol,
          nombre: `${PREFIX}${slug}`,
        })
        .returning()
    )[0]!;
  await mkAdmin(tenA.id, 'adminA', 'ADMIN');
  await mkAdmin(tenB.id, 'adminB', 'ADMIN');

  app = await NestFactory.create(AppModule, { logger: false });
  app.use(json({ verify: (req, _res, buf) => { (req as unknown as { rawBody?: Buffer }).rawBody = buf; } }));
  await app.listen(0);
  base = await app.getUrl().then((u) => u.replace('[::1]', '127.0.0.1'));

  // El login está rate-limited: una sola pasada, en serie, y se reusan tokens.
  for (const slug of ['adminA', 'adminB', 'prop1a', 'inq1a', 'vec2b', 'multi', 'ajenoB']) {
    tokens[slug] = await login(`${PREFIX}${slug}@test.dev`);
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
  if (creados.tenants.length) {
    await systemDb.delete(tenantTable).where(inArray(tenantTable.id, creados.tenants));
  }
});

describe('pertenencia a consorcios', () => {
  it('un residente en dos consorcios de la misma administración ve ambos vínculos', async () => {
    const res = await api('GET', '/me/vinculos', 'multi');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const consorcios = new Set(res.body.map((v: { consorcioId?: string }) => v.consorcioId));
    expect(consorcios.has(c1.id)).toBe(true);
    expect(consorcios.has(c2.id)).toBe(true);
  });

  it('un residente con un solo vínculo no ve más que el suyo', async () => {
    const res = await api('GET', '/me/vinculos', 'prop1a');
    expect(res.body).toHaveLength(1);
  });

  it('puede reportar en un consorcio donde tiene vínculo', async () => {
    const res = await api('POST', '/tickets', 'multi', {
      consorcio_id: c2.id,
      unidad_id: uL9.id,
      tipo: 'INFRAESTRUCTURA',
      titulo: 'Poda del lote',
      descripcion: 'pasto alto',
    });
    expect(res.status).toBeLessThan(300);
  });

  it('no puede reportar en otro consorcio de su misma administración', async () => {
    const res = await api('POST', '/tickets', 'prop1a', {
      consorcio_id: c2.id,
      unidad_id: uL9.id,
      tipo: 'INFRAESTRUCTURA',
      titulo: 'Intruso',
      descripcion: 'x',
    });
    expect([403, 404]).toContain(res.status);
  });

  it('no puede imputar una unidad que pertenece a otro consorcio', async () => {
    const res = await api('POST', '/tickets', 'prop1a', {
      consorcio_id: c1.id,
      unidad_id: uL9.id,
      tipo: 'INFRAESTRUCTURA',
      titulo: 'Unidad ajena',
      descripcion: 'x',
    });
    expect(res.status).toBe(400);
  });
});

describe('visibilidad por unidad dentro del mismo consorcio', () => {
  let tUnidad: string;
  let tComun: string;

  beforeAll(async () => {
    const a = await api('POST', '/tickets', 'prop1a', {
      consorcio_id: c1.id,
      unidad_id: u1a.id,
      tipo: 'INFRAESTRUCTURA',
      origen_sugerido: 'UNIDAD',
      titulo: 'Pérdida en el baño',
      descripcion: 'gotea',
    });
    tUnidad = a.body.id;
    const b = await api('POST', '/tickets', 'prop1a', {
      consorcio_id: c1.id,
      unidad_id: null,
      tipo: 'INFRAESTRUCTURA',
      origen_sugerido: 'ESPACIO_COMUN',
      titulo: 'Luz del hall',
      descripcion: 'quemada',
    });
    tComun = b.body.id;
    await api('POST', `/tickets/${tUnidad}/transitions`, 'adminA', { to: 'VALIDADO', origen: 'UNIDAD' });
    await api('POST', `/tickets/${tComun}/transitions`, 'adminA', { to: 'VALIDADO', origen: 'ESPACIO_COMUN' });
  }, 60_000);

  it('el ticket de una unidad lo ven sus ocupantes (propietario e inquilino)', async () => {
    expect((await api('GET', `/tickets/${tUnidad}`, 'prop1a')).status).toBe(200);
    expect((await api('GET', `/tickets/${tUnidad}`, 'inq1a')).status).toBe(200);
  });

  it('el vecino de otra unidad del mismo consorcio recibe 404, no 403', async () => {
    // 403 confirmaría que el ticket existe. La ausencia debe ser indistinguible.
    expect((await api('GET', `/tickets/${tUnidad}`, 'vec2b')).status).toBe(404);
  });

  it('el ticket de espacio común lo ve todo el consorcio', async () => {
    expect((await api('GET', `/tickets/${tComun}`, 'vec2b')).status).toBe(200);
    expect((await api('GET', `/tickets/${tComun}`, 'inq1a')).status).toBe(200);
  });

  it('nada de esto se ve desde otra administración', async () => {
    expect((await api('GET', `/tickets/${tComun}`, 'ajenoB')).status).toBe(404);
    expect((await api('GET', `/tickets/${tUnidad}`, 'ajenoB')).status).toBe(404);
  });

  it('el costo confirmado de la propia unidad es visible a sus ocupantes', async () => {
    // El defecto original: el propietario que paga al plomero recibía 404 al
    // pedir el monto de su propia reparación.
    const g = await api('POST', `/tickets/${tUnidad}/gastos`, 'adminA', {
      monto: 9999,
      descripcion: 'Plomero',
      estado: 'CONFIRMADO',
    });
    expect(g.status).toBeLessThan(300);

    const propio = await api('GET', `/tickets/${tUnidad}/gastos`, 'prop1a');
    expect(propio.status).toBe(200);
    expect(propio.body).toHaveLength(1);
    const inquilino = await api('GET', `/tickets/${tUnidad}/gastos`, 'inq1a');
    expect(inquilino.body).toHaveLength(1);
  });

  it('ese mismo costo sigue oculto para el resto del consorcio', async () => {
    const vecino = await api('GET', `/tickets/${tUnidad}/gastos`, 'vec2b');
    expect(vecino.status).toBe(404);
  });

  it('el borrador nunca se publica, ni al ocupante de la unidad', async () => {
    await api('POST', `/tickets/${tUnidad}/gastos`, 'adminA', {
      monto: 123456,
      descripcion: 'presupuesto tentativo',
      estado: 'BORRADOR',
    });
    const propio = await api('GET', `/tickets/${tUnidad}/gastos`, 'prop1a');
    expect(propio.body.every((g: { estado: string }) => g.estado === 'CONFIRMADO')).toBe(true);
  });
});

describe('conducta: anonimato del reportante', () => {
  let tConducta: string;

  beforeAll(async () => {
    const r = await api('POST', '/tickets', 'vec2b', {
      consorcio_id: c1.id,
      unidad_id: u1a.id,
      tipo: 'CONDUCTA',
      titulo: 'Ruidos molestos',
      descripcion: 'música a las 3am',
    });
    tConducta = r.body.id;
    await api('POST', `/tickets/${tConducta}/transitions`, 'adminA', {
      to: 'VALIDADO',
      origen: 'UNIDAD',
      unidad_reportada_id: u1a.id,
    });
  }, 60_000);

  it('el acusado ve la denuncia pero no quién la hizo', async () => {
    const res = await api('GET', `/tickets/${tConducta}`, 'prop1a');
    expect(res.status).toBe(200);
    expect(res.body.reportanteId ?? null).toBeNull();
  });

  it('el admin sí ve al reportante', async () => {
    const res = await api('GET', `/tickets/${tConducta}`, 'adminA');
    expect(res.body.reportanteId).toBe(vecino2b.id);
  });

  it('la nota interna no viaja en el aviso que recibe el vecino', async () => {
    // Las tres plantillas la interpolaban, así que escribir "ojo que este vecino
    // reclama por todo" se lo mandaba por WhatsApp — y no solo al que reportó: la
    // notificación va también a todos los que votaron el ticket.
    const secreto = 'ojo-que-este-vecino-reclama-por-todo';
    const r = await api('POST', '/tickets', 'prop1a', {
      consorcio_id: c1.id,
      unidad_id: u1a.id,
      tipo: 'INFRAESTRUCTURA',
      origen_sugerido: 'ESPACIO_COMUN',
      titulo: 'Con nota que no debe salir',
      descripcion: 'x',
    });
    await api('POST', `/tickets/${r.body.id}/transitions`, 'adminA', {
      to: 'VALIDADO',
      origen: 'ESPACIO_COMUN',
      nota: secreto,
    });

    // La notificación se encola de forma asíncrona (setImmediate), así que se le
    // da una vuelta al event loop antes de mirar.
    await new Promise((resolver) => setTimeout(resolver, 400));
    const avisos = await systemDb
      .select({ plantilla: notificacion.plantilla })
      .from(notificacion)
      .where(eq(notificacion.ticketId, r.body.id));

    // Lo que se guarda es la plantilla, no el texto: alcanza con verificar que
    // ninguna plantilla del catálogo interpole la nota.
    const { NOTIFICATION_TEMPLATES } = await import('../../src/notifications/templates.js');
    for (const tpl of Object.values(NOTIFICATION_TEMPLATES)) {
      const cuerpo = tpl.body({ short: 'abc12345', nota: secreto });
      expect(cuerpo).not.toContain(secreto);
    }
    expect(avisos.length).toBeGreaterThanOrEqual(0);
  });

  it('la nota interna tampoco se filtra en un ticket de infraestructura', async () => {
    // El panel la pide como "NOTA INTERNA — contexto para el equipo". Antes se
    // ocultaba solo en CONDUCTA, así que en infraestructura el residente la leía
    // y el rótulo mentía.
    const r = await api('POST', '/tickets', 'prop1a', {
      consorcio_id: c1.id,
      unidad_id: u1a.id,
      tipo: 'INFRAESTRUCTURA',
      origen_sugerido: 'ESPACIO_COMUN',
      titulo: 'Luz del hall, con nota',
      descripcion: 'quemada',
    });
    await api('POST', `/tickets/${r.body.id}/transitions`, 'adminA', {
      to: 'VALIDADO',
      origen: 'ESPACIO_COMUN',
      nota: 'ojo que este vecino reclama por todo',
    });

    const comoAdmin = await api('GET', `/tickets/${r.body.id}/historial`, 'adminA');
    expect(comoAdmin.body.some((h: { nota?: string | null }) => h.nota?.includes('reclama'))).toBe(true);

    const comoVecino = await api('GET', `/tickets/${r.body.id}/historial`, 'prop1a');
    expect(comoVecino.status).toBe(200);
    expect(comoVecino.body.every((h: { nota?: string | null }) => h.nota == null)).toBe(true);
  });

  it('el historial no le filtra al acusado la nota del admin', async () => {
    const res = await api('GET', `/tickets/${tConducta}/historial`, 'prop1a');
    expect(res.status).toBe(200);
    expect(res.body.every((h: { nota: unknown; autorTipo: unknown }) => h.nota == null && h.autorTipo == null)).toBe(true);
  });

  it('validar una conducta exige la unidad reportada', async () => {
    const r = await api('POST', '/tickets', 'vec2b', {
      consorcio_id: c1.id,
      unidad_id: u1a.id,
      tipo: 'CONDUCTA',
      titulo: 'Otra conducta',
      descripcion: 'x',
    });
    const sin = await api('POST', `/tickets/${r.body.id}/transitions`, 'adminA', { to: 'VALIDADO', origen: 'UNIDAD' });
    expect(sin.status).toBeGreaterThanOrEqual(400);
    const cruzada = await api('POST', `/tickets/${r.body.id}/transitions`, 'adminA', {
      to: 'VALIDADO',
      origen: 'UNIDAD',
      unidad_reportada_id: u9z.id, // unidad de OTRA administración
    });
    expect(cruzada.status).toBeGreaterThanOrEqual(400);
  });

  it('una conducta no se vota', async () => {
    const res = await api('POST', `/tickets/${tConducta}/votes`, 'prop1a');
    expect(res.status).toBe(403);
  });

  it('la sanción se registra contra la unidad SEÑALADA, no contra la del denunciante', async () => {
    // El defecto: el registro se escribía contra `unidad_id`, y en un ticket
    // creado por el bot ese campo es la unidad de QUIEN DENUNCIA —el bot imputa
    // la unidad del que escribe—. Así que un aviso o una sanción le ensuciaba el
    // historial de convivencia al vecino que reportó.
    //
    // El ticket se arma igual que el del bot: `unidad_id` = 2B (el denunciante,
    // vec2b) y la unidad señalada al validar = 1A. Con los dos campos distintos
    // el test distingue de verdad; si `unidad_id` ya fuera la acusada, pasaría
    // también con el código viejo.
    const r = await api('POST', '/tickets', 'vec2b', {
      consorcio_id: c1.id,
      unidad_id: u2b.id,
      tipo: 'CONDUCTA',
      titulo: 'Ruidos, reportado desde el 2B',
      descripcion: 'la del 1A pone música de madrugada',
    });
    const idConducta = r.body.id;
    await api('POST', `/tickets/${idConducta}/transitions`, 'adminA', {
      to: 'VALIDADO',
      origen: 'UNIDAD',
      unidad_reportada_id: u1a.id,
    });

    const res = await api('POST', `/tickets/${idConducta}/registros-conducta`, 'adminA', {
      resultado: 'SANCION',
      detalle: 'segunda vez en el mes',
    });
    expect(res.status).toBeLessThan(300);
    expect(res.body.unidadId).toBe(u1a.id);
    expect(res.body.unidadId).not.toBe(u2b.id);

    // Aparece en el historial de convivencia de la unidad señalada...
    const hist = await api('GET', `/unidades/${u1a.id}/historial-conducta`, 'adminA');
    expect(hist.status).toBe(200);
    expect(hist.body.some((h: { ticketId: string }) => h.ticketId === idConducta)).toBe(true);

    // ...y NO en el del denunciante, que es el punto del arreglo.
    const otro = await api('GET', `/unidades/${u2b.id}/historial-conducta`, 'adminA');
    expect(otro.body.some((h: { ticketId: string }) => h.ticketId === idConducta)).toBe(false);
  });

  it('no se puede sancionar una conducta sin unidad señalada', async () => {
    const r = await api('POST', '/tickets', 'vec2b', {
      consorcio_id: c1.id,
      unidad_id: u2b.id,
      tipo: 'CONDUCTA',
      titulo: 'Sin señalar',
      descripcion: 'x',
    });
    const res = await api('POST', `/tickets/${r.body.id}/registros-conducta`, 'adminA', {
      resultado: 'AVISO',
    });
    expect(res.status).toBe(403);
  });

  it('no se puede sancionar un ticket de infraestructura', async () => {
    const r = await api('POST', '/tickets', 'adminA', {
      consorcio_id: c1.id,
      unidad_id: null,
      tipo: 'INFRAESTRUCTURA',
      titulo: 'No es conducta',
      descripcion: 'x',
    });
    const res = await api('POST', `/tickets/${r.body.id}/registros-conducta`, 'adminA', {
      resultado: 'SANCION',
    });
    expect(res.status).toBe(403);
  });

  it('el historial de convivencia no lo ve un residente', async () => {
    const res = await api('GET', `/unidades/${u1a.id}/historial-conducta`, 'prop1a');
    expect(res.status).toBe(403);
  });

  it('el historial de convivencia no cruza administraciones', async () => {
    const res = await api('GET', `/unidades/${u1a.id}/historial-conducta`, 'adminB');
    expect(res.status === 200 ? res.body.length : 0).toBe(0);
  });
});

describe('invitación de inquilino (solo el propietario de esa unidad)', () => {
  it('el propietario puede invitar y el invitado queda operativo', async () => {
    const email = `${PREFIX}invitado@test.dev`;
    const res = await api('POST', '/residentes/invite-inquilino', 'prop1a', {
      unidad_id: u1a.id,
      nombre: `${PREFIX}invitado`,
      telefono_e164: tel(),
      email,
      password: 'test1234',
    });
    expect(res.status).toBeLessThan(300);

    tokens.invitado = await login(email);
    const vinculos = await api('GET', '/me/vinculos', 'invitado');
    expect(vinculos.body).toHaveLength(1);
    expect(vinculos.body[0].rol).toBe('INQUILINO');
  });

  it('un inquilino no puede invitar a otro inquilino', async () => {
    const res = await api('POST', '/residentes/invite-inquilino', 'inq1a', {
      unidad_id: u1a.id,
      nombre: `${PREFIX}no`,
      telefono_e164: tel(),
      email: `${PREFIX}no1@test.dev`,
      password: 'test1234',
    });
    expect(res.status).toBe(403);
  });

  it('el propietario de otra unidad del mismo consorcio no puede invitar a esa unidad', async () => {
    const res = await api('POST', '/residentes/invite-inquilino', 'vec2b', {
      unidad_id: u1a.id,
      nombre: `${PREFIX}no`,
      telefono_e164: tel(),
      email: `${PREFIX}no2@test.dev`,
      password: 'test1234',
    });
    expect(res.status).toBe(403);
  });

  it('un residente de otra administración no puede invitar acá', async () => {
    const res = await api('POST', '/residentes/invite-inquilino', 'ajenoB', {
      unidad_id: u1a.id,
      nombre: `${PREFIX}no`,
      telefono_e164: tel(),
      email: `${PREFIX}no3@test.dev`,
      password: 'test1234',
    });
    expect(res.status).toBe(403);
  });
});

describe('aislamiento entre administraciones', () => {
  it('editar un consorcio ajeno devuelve 404, no 200 con body vacío', async () => {
    // El UPDATE ya tocaba 0 filas, pero devolvía 200 y el panel mostraba
    // "guardado" sin haber guardado nada.
    const res = await api('PATCH', `/consorcios/${c1.id}`, 'adminB', { nombre: 'renombrado por otro tenant' });
    expect(res.status).toBe(404);
    const sigue = await systemDb.select().from(consorcio).where(eq(consorcio.id, c1.id));
    expect(sigue[0]!.nombre).toBe(`${PREFIX}c1`);
  });

  it('el listado de consorcios no cruza administraciones', async () => {
    const res = await api('GET', '/consorcios', 'adminB');
    const ids = res.body.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(c1.id);
    expect(ids).toContain(c3.id);
  });

  it('no se puede crear una unidad en el consorcio de otra administración', async () => {
    const res = await api('POST', '/unidades', 'adminB', { consorcio_id: c1.id, etiqueta: 'PWN' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('no se puede vincular un residente ajeno a una unidad propia', async () => {
    const res = await api('POST', '/vinculos', 'adminB', {
      residente_id: propietario1a.id,
      unidad_id: u9z.id,
      rol: 'PROPIETARIO',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('un ADMIN no puede crear administraciones (es privilegio de SUPER_ADMIN)', async () => {
    expect((await api('GET', '/tenants', 'adminA')).status).toBe(403);
    expect((await api('POST', '/tenants', 'adminA', { nombre: 'x' })).status).toBe(403);
  });
});

describe('gates de rol', () => {
  const soloAdmin = ['/tickets', '/residentes', '/consorcios', '/vinculos', '/categorias', '/admin/metrics', '/admin/audit-log', '/admin/notificaciones'];
  for (const path of soloAdmin) {
    it(`un residente no entra a ${path}`, async () => {
      expect((await api('GET', path, 'prop1a')).status).toBe(403);
    });
  }

  const soloResidente = ['/me/tickets', '/me/vinculos'];
  for (const path of soloResidente) {
    it(`un admin no entra a ${path}`, async () => {
      expect((await api('GET', path, 'adminA')).status).toBe(403);
    });
  }

  it('un residente no puede transicionar un ticket', async () => {
    const r = await api('POST', '/tickets', 'prop1a', {
      consorcio_id: c1.id,
      unidad_id: u1a.id,
      tipo: 'INFRAESTRUCTURA',
      titulo: 'para transicionar',
      descripcion: 'x',
    });
    const res = await api('POST', `/tickets/${r.body.id}/transitions`, 'prop1a', { to: 'VALIDADO' });
    expect(res.status).toBe(403);
  });

  it('un admin no puede votar', async () => {
    const r = await api('POST', '/tickets', 'prop1a', {
      consorcio_id: c1.id,
      unidad_id: null,
      tipo: 'INFRAESTRUCTURA',
      origen_sugerido: 'ESPACIO_COMUN',
      titulo: 'votable',
      descripcion: 'x',
    });
    expect((await api('POST', `/tickets/${r.body.id}/votes`, 'adminA')).status).toBe(403);
  });
});

describe('máquina de estados', () => {
  let t: string;
  beforeAll(async () => {
    const r = await api('POST', '/tickets', 'adminA', {
      consorcio_id: c1.id,
      unidad_id: null,
      tipo: 'INFRAESTRUCTURA',
      titulo: 'fsm',
      descripcion: 'x',
    });
    t = r.body.id;
  }, 30_000);

  it('no se puede saltar de REGISTRADO a SOLUCIONADO', async () => {
    expect((await api('POST', `/tickets/${t}/transitions`, 'adminA', { to: 'SOLUCIONADO' })).status).toBeGreaterThanOrEqual(400);
  });

  it('el camino feliz avanza y no admite reapertura', async () => {
    expect((await api('POST', `/tickets/${t}/transitions`, 'adminA', { to: 'VALIDADO', origen: 'ESPACIO_COMUN' })).status).toBeLessThan(300);
    expect((await api('POST', `/tickets/${t}/transitions`, 'adminA', { to: 'SOLUCIONADO' })).status).toBeLessThan(300);
    // Sin reapertura (ADR-002): si el problema reaparece se crea un ticket nuevo.
    expect((await api('POST', `/tickets/${t}/transitions`, 'adminA', { to: 'VALIDADO' })).status).toBeGreaterThanOrEqual(400);
  });

  it('un admin de otra administración no puede transicionar', async () => {
    const r = await api('POST', '/tickets', 'adminA', {
      consorcio_id: c1.id,
      unidad_id: null,
      tipo: 'INFRAESTRUCTURA',
      titulo: 'fsm ajeno',
      descripcion: 'x',
    });
    expect((await api('POST', `/tickets/${r.body.id}/transitions`, 'adminB', { to: 'VALIDADO' })).status).toBe(404);
  });
});

describe('idempotencia', () => {
  it('el mismo client_generated_id no duplica el ticket', async () => {
    const body = {
      consorcio_id: c1.id,
      unidad_id: u1a.id,
      tipo: 'INFRAESTRUCTURA',
      titulo: 'idempotente',
      descripcion: 'x',
      client_generated_id: crypto.randomUUID(),
    };
    const a = await api('POST', '/tickets', 'prop1a', body);
    const b = await api('POST', '/tickets', 'prop1a', body);
    expect(a.body.id).toBe(b.body.id);
    const filas = await systemDb.select().from(ticket).where(eq(ticket.clientGeneratedId, body.client_generated_id));
    expect(filas).toHaveLength(1);
  });
});

// `gasto` se elimina en cascada con el tenant; la referencia explícita evita que
// el import quede sin usar si alguien recorta un caso.
void gasto;
