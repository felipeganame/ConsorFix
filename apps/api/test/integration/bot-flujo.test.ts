import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import type { InboundMessage } from '@consorciofix/messaging';
import { systemDb } from '../../src/db/client.js';
import {
  clasificacionIa,
  consorcio,
  residente,
  sesionBot,
  tenant as tenantTable,
  ticket,
  unidad,
  vinculoResidente,
  webhookEvent,
} from '../../src/db/schema/index.js';
import { BotService } from '../../src/bot/bot.service.js';
import { StorageService } from '../../src/storage/storage.service.js';

/**
 * Flujo del bot (P1 / RF-B01..B07, B10) por su única puerta de entrada:
 * `BotService.handle`.
 *
 * Se llama al service en vez de al webhook porque firmar el payload exige el
 * secreto del proveedor, que no existe en CI; la cadena firma → webhook → cola
 * ya está cubierta en `bot-tenant-routing` y en la suite de aislamiento. Lo que
 * falta cubrir —y es lo que este archivo cubre— es la lógica de conversación:
 * quién escribe, a qué consorcio pertenece, y qué pasa cuando pertenece a más
 * de uno. `bot` era el módulo con menos cobertura del repo (10%).
 *
 * El clasificador y el embedder son mocks en proceso (AI_PROVIDER por defecto),
 * así que no hace falta red. `reply()` traga los errores de envío, así que la
 * ausencia del mock de WhatsApp no altera ningún resultado.
 */
const PREFIX = `bot_${Date.now()}_`;
const tel = (n: number) => `+5498${String(Date.now()).slice(-7)}${String(n).padStart(2, '0')}`;

let bot: BotService;

let tenA: { id: string };
let tenB: { id: string };
let c1: { id: string };
let c2: { id: string };
let cB: { id: string };
let u1: { id: string };
let u2: { id: string };
let uB: { id: string };

let unConsorcio: { id: string };
let dosConsorcios: { id: string };
let sinConsorcio: { id: string };
let duplicadoA: { id: string };
let duplicadoB: { id: string };

const TEL_UNO = tel(1);
const TEL_DOS = tel(2);
const TEL_SIN = tel(3);
const TEL_DUP = tel(4);
const TEL_DESCONOCIDO = tel(9);

let seq = 0;
function msg(from: string, text: string): InboundMessage {
  seq += 1;
  return {
    wamid: `${PREFIX}wamid_${seq}`,
    from: from as `+${string}`,
    kind: 'text',
    text,
    receivedAt: new Date(),
  };
}

async function ticketsDe(residenteId: string) {
  return systemDb.select().from(ticket).where(eq(ticket.reportanteId, residenteId));
}

beforeAll(async () => {
  bot = new BotService(new StorageService());

  const mkTenant = async (s: string) =>
    (await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}${s}`, plan: 'basico' }).returning())[0]!;
  tenA = await mkTenant('A');
  tenB = await mkTenant('B');

  const mkCons = async (tid: string, s: string) =>
    (await systemDb.insert(consorcio).values({ tenantId: tid, nombre: `${PREFIX}${s}`, tipo: 'EDIFICIO' }).returning())[0]!;
  c1 = await mkCons(tenA.id, 'Torre1');
  c2 = await mkCons(tenA.id, 'Torre2');
  cB = await mkCons(tenB.id, 'OtraAdmin');

  const mkUni = async (tid: string, cid: string, etiqueta: string) =>
    (await systemDb.insert(unidad).values({ tenantId: tid, consorcioId: cid, etiqueta }).returning())[0]!;
  u1 = await mkUni(tenA.id, c1.id, '1A');
  u2 = await mkUni(tenA.id, c2.id, '2A');
  uB = await mkUni(tenB.id, cB.id, '9Z');

  const mkResi = async (tid: string, s: string, telefono: string) =>
    (
      await systemDb
        .insert(residente)
        .values({ tenantId: tid, nombre: `${PREFIX}${s}`, telefonoE164: telefono })
        .returning()
    )[0]!;
  unConsorcio = await mkResi(tenA.id, 'uno', TEL_UNO);
  dosConsorcios = await mkResi(tenA.id, 'dos', TEL_DOS);
  sinConsorcio = await mkResi(tenA.id, 'sin', TEL_SIN);
  // El MISMO teléfono cargado en dos administraciones distintas.
  duplicadoA = await mkResi(tenA.id, 'dupA', TEL_DUP);
  duplicadoB = await mkResi(tenB.id, 'dupB', TEL_DUP);

  const vinc = (tid: string, rid: string, uid: string, activo = true) =>
    systemDb.insert(vinculoResidente).values({ tenantId: tid, residenteId: rid, unidadId: uid, rol: 'PROPIETARIO', activo });
  await vinc(tenA.id, unConsorcio.id, u1.id);
  await vinc(tenA.id, dosConsorcios.id, u1.id);
  await vinc(tenA.id, dosConsorcios.id, u2.id);
  await vinc(tenA.id, duplicadoA.id, u1.id);
  await vinc(tenB.id, duplicadoB.id, uB.id);
  // `sinConsorcio` tiene un vínculo DADO DE BAJA: existe la fila, pero no cuenta.
  await vinc(tenA.id, sinConsorcio.id, u1.id, false);
}, 120_000);

afterAll(async () => {
  await systemDb.delete(tenantTable).where(inArray(tenantTable.id, [tenA.id, tenB.id]));
});

beforeEach(async () => {
  // Las sesiones viven por teléfono y sobreviven al caso anterior.
  await systemDb.delete(sesionBot).where(inArray(sesionBot.telefonoE164, [TEL_UNO, TEL_DOS, TEL_SIN, TEL_DUP]));
});

describe('identificación de quién escribe', () => {
  it('un teléfono desconocido no crea nada', async () => {
    const r = await bot.handle(msg(TEL_DESCONOCIDO, 'se rompió el ascensor'));
    expect(r.status).toBe('unregistered');
    expect(r.ticketId).toBeUndefined();
  });

  it('un teléfono cargado en dos administraciones NO se rutea a ninguna', async () => {
    // Es la decisión importante: preferir no atender antes que imputarle el
    // reporte al tenant equivocado, que sería una fuga entre clientes.
    const r = await bot.handle(msg(TEL_DUP, 'hay una pérdida de agua'));
    expect(r.status).toBe('ambiguous-tenant');
    expect(await ticketsDe(duplicadoA.id)).toHaveLength(0);
    expect(await ticketsDe(duplicadoB.id)).toHaveLength(0);
  });

  it('un vínculo dado de baja no habilita a reportar', async () => {
    const r = await bot.handle(msg(TEL_SIN, 'se quemó una luz'));
    expect(r.status).toBe('no-active-consorcios');
    expect(await ticketsDe(sinConsorcio.id)).toHaveLength(0);
  });
});

describe('residente de un solo consorcio', () => {
  it('pide confirmación antes de crear el ticket (RF-B06)', async () => {
    const r = await bot.handle(msg(TEL_UNO, 'se rompió el portón del garage'));
    expect(r.status).toBe('awaiting-report-confirm');
    // Nada en la bandeja todavía: el residente tiene que poder corregir.
    const antes = await ticketsDe(unConsorcio.id);
    expect(antes).toHaveLength(0);
  });

  it('al confirmar crea el ticket en su consorcio, con la sugerencia de la IA', async () => {
    await bot.handle(msg(TEL_UNO, 'se rompió el portón del garage'));
    const r = await bot.handle(msg(TEL_UNO, 'sí'));
    expect(r.ticketId).toBeTruthy();

    const t = (await systemDb.select().from(ticket).where(eq(ticket.id, r.ticketId!)))[0]!;
    expect(t.consorcioId).toBe(c1.id);
    expect(t.reportanteId).toBe(unConsorcio.id);
    expect(t.estado).toBe('REGISTRADO');
    expect(t.tenantId).toBe(tenA.id);

    // Regla 4: la salida del clasificador se persiste como sugerencia.
    const ia = await systemDb.select().from(clasificacionIa).where(eq(clasificacionIa.ticketId, t.id));
    expect(ia).toHaveLength(1);
    expect(ia[0]!.corregidoPorAdmin).toBeNull();
  });

  it('al rechazar no crea nada y deja la puerta abierta', async () => {
    await bot.handle(msg(TEL_UNO, 'hay olor a gas en el pasillo'));
    const r = await bot.handle(msg(TEL_UNO, 'no'));
    expect(r.status).toBe('report-rejected');
    expect(r.ticketId).toBeUndefined();
  });

  it('un texto que no es sí ni no se toma como corrección, no como error', async () => {
    await bot.handle(msg(TEL_UNO, 'se rompió algo'));
    // El residente reescribe en vez de contestar sí/no.
    const r = await bot.handle(msg(TEL_UNO, 'en realidad es la bomba de agua del tanque'));
    // Vuelve a pedir confirmación sobre la versión corregida, sin descartarla.
    expect(r.status).toBe('awaiting-report-confirm');
    const conf = await bot.handle(msg(TEL_UNO, 'dale'));
    const t = (await systemDb.select().from(ticket).where(eq(ticket.id, conf.ticketId!)))[0]!;
    expect(t.descripcionNormalizada.toLowerCase()).toContain('bomba');
  });
});

describe('residente en varios consorcios (P1 / RF-B02)', () => {
  it('pregunta a cuál de sus consorcios corresponde', async () => {
    const r = await bot.handle(msg(TEL_DOS, 'se tapó un desagüe'));
    expect(r.status).toBe('awaiting-consorcio-choice');
    expect(await ticketsDe(dosConsorcios.id)).toHaveLength(0);
  });

  it('una respuesta fuera de rango no elige por él', async () => {
    await bot.handle(msg(TEL_DOS, 'se tapó un desagüe'));
    const r = await bot.handle(msg(TEL_DOS, '7'));
    expect(r.status).toBe('consorcio-choice-invalid');
    expect(await ticketsDe(dosConsorcios.id)).toHaveLength(0);
    // Y la sesión sigue viva para reintentar.
    const sesiones = await systemDb.select().from(sesionBot).where(eq(sesionBot.telefonoE164, TEL_DOS));
    expect(sesiones).toHaveLength(1);
  });

  it('elegir la opción 2 imputa el ticket a ESE consorcio, no al otro', async () => {
    await bot.handle(msg(TEL_DOS, 'el alumbrado del estacionamiento no anda'));

    // Se lee de la sesión qué consorcio quedó en la posición 2, para no depender
    // del orden en que la query devuelva los vínculos.
    const sesion = (await systemDb.select().from(sesionBot).where(eq(sesionBot.telefonoE164, TEL_DOS)))[0]!;
    const opciones = (sesion.estadoFlujo as { options?: Array<{ consorcioId: string }> }).options ?? [];
    expect(opciones).toHaveLength(2);
    const segundo = opciones[1]!.consorcioId;
    const descartado = opciones[0]!.consorcioId;

    const elegido = await bot.handle(msg(TEL_DOS, '2'));
    // Tras elegir el consorcio, todavía falta confirmar el reporte.
    expect(elegido.status).toBe('awaiting-report-confirm');
    const r = await bot.handle(msg(TEL_DOS, 'sí'));

    const t = (await systemDb.select().from(ticket).where(eq(ticket.id, r.ticketId!)))[0]!;
    expect(t.consorcioId).toBe(segundo);
    expect(t.consorcioId).not.toBe(descartado);
    // El texto del reporte no se perdió entre la pregunta y la respuesta.
    expect(t.descripcionNormalizada.length).toBeGreaterThan(0);
    // La unidad imputada pertenece al consorcio elegido.
    if (t.unidadId) {
      const u = (await systemDb.select().from(unidad).where(eq(unidad.id, t.unidadId)))[0]!;
      expect(u.consorcioId).toBe(t.consorcioId);
    }
    expect([c1.id, c2.id]).toContain(t.consorcioId);
  });
});

describe('comandos (RF-B10)', () => {
  it('"estado" consulta reportes, no crea un ticket titulado "estado"', async () => {
    const antes = (await ticketsDe(unConsorcio.id)).length;
    const r = await bot.handle(msg(TEL_UNO, 'estado'));
    expect(r.status).not.toBe('awaiting-report-confirm');
    expect((await ticketsDe(unConsorcio.id)).length).toBe(antes);
  });

  it('preguntar por los reportes contesta la lista, sin escribir "estado"', async () => {
    // "¿Cuál fue el último registro?" recibía "no encontré un problema para
    // registrar": cierto e inútil. Ahora el clasificador dice CONSULTA_ESTADO y
    // el bot rutea al mismo handler que la palabra escrita exacta.
    const antes = (await ticketsDe(unConsorcio.id)).length;
    for (const texto of ['Cuál fue el último registro?', 'cómo vienen mis reclamos?', 'tengo algo pendiente?']) {
      const r = await bot.handle(msg(TEL_UNO, texto));
      expect(r.status, texto).toMatch(/^comando-estado/);
    }
    expect((await ticketsDe(unConsorcio.id)).length).toBe(antes);
  });

  it('una pregunta que además trae un problema se registra igual', async () => {
    // Perder un reporte es peor que no contestar una pregunta: si el mensaje
    // trae las dos cosas, gana el reporte.
    const r = await bot.handle(msg(TEL_UNO, 'se rompió el ascensor, alguna novedad?'));
    expect(r.status).not.toMatch(/^comando-/);
    expect(r.status).not.toBe('sin-reporte');
  });

  it('todo mensaje atendido queda marcado como procesado (regla 3)', async () => {
    // `wamid` es la clave de idempotencia: si el evento no se marca, una
    // reentrega del proveedor vuelve a contestarle al vecino. Cada camino se
    // acordaba de marcarlo por su cuenta y varios se olvidaban —los comandos,
    // los mensajes vacíos y los errores de audio quedaban en RECIBIDO—, así que
    // ahora se marca en un solo lugar. Este test recorre caminos deliberadamente
    // distintos: comando, cortesía, pregunta ruteada por intención, reporte y
    // mensaje vacío.
    const casos = ['ayuda', 'estado', 'gracias', 'hola como andas', 'se rompió la bomba de agua', ''];
    for (const [i, texto] of casos.entries()) {
      const m = msg(TEL_UNO, texto);
      await systemDb.insert(webhookEvent).values({
        provider: 'telegram',
        wamid: m.wamid,
        fromPhone: TEL_UNO,
        payload: { texto, caso: i },
      });
      await bot.handle(m);
      const [ev] = await systemDb
        .select({ estado: webhookEvent.estado })
        .from(webhookEvent)
        .where(eq(webhookEvent.wamid, m.wamid));
      expect(ev?.estado, `"${texto}" quedó sin marcar`).toBe('PROCESADO');
    }
  });

  it('todo comando que el menú anuncia, el bot lo acepta', async () => {
    // El menú prometía "*estado*" y el set de comandos solo tenía "estados", así
    // que escribir exactamente la palabra que el bot te dice caía en la lista de
    // cortesías: el vecino recibía "cuando necesites algo, contame" en lugar de
    // sus reportes. Este test lee los comandos del propio texto del menú, así que
    // agregar una línea al menú sin implementarla vuelve a fallar acá.
    const enviados: string[] = [];
    const original = bot['reply'].bind(bot);
    (bot as unknown as { reply: unknown }).reply = async (to: string, texto: string, ctx: unknown) => {
      enviados.push(texto);
      return (original as (a: string, b: string, c: unknown) => Promise<void>)(to, texto, ctx);
    };
    try {
      await bot.handle(msg(TEL_UNO, 'ayuda'));
      const menu = enviados.find((t) => t.includes('Comandos:'));
      expect(menu).toBeTruthy();
      const anunciados = [...menu!.matchAll(/•\s*\*([^*]+)\*/g)].map((m) => m[1]!.trim());
      expect(anunciados.length).toBeGreaterThan(0);
      for (const cmd of anunciados) {
        enviados.length = 0;
        const r = await bot.handle(msg(TEL_UNO, cmd));
        expect(r.status, `el menú anuncia "${cmd}" pero el bot no lo trata como comando`).toMatch(
          /^comando-/,
        );
      }
    } finally {
      (bot as unknown as { reply: unknown }).reply = original;
    }
  });

  it('"ayuda" responde el menú', async () => {
    const r = await bot.handle(msg(TEL_UNO, 'ayuda'));
    expect(r.status).toBe('comando-ayuda');
  });

  it('acepta el comando con barra, como en Telegram', async () => {
    const r = await bot.handle(msg(TEL_UNO, '/ayuda'));
    expect(r.status).toBe('comando-ayuda');
  });

  it('una cortesía no se convierte en reclamo', async () => {
    // Un "Gracias" salía como un reporte inventado —"Agujero en el techo del
    // pasillo", urgencia alta— porque el clasificador está obligado a clasificar
    // cualquier texto. Se ataja antes de llamar al modelo: además de no ensuciar
    // la bandeja, ahorra una llamada paga por cada agradecimiento.
    const antes = (await ticketsDe(unConsorcio.id)).length;
    for (const texto of ['Gracias', 'gracias!', 'ok', 'dale', 'buenas']) {
      const r = await bot.handle(msg(TEL_UNO, texto));
      expect(r.status).toBe('cortesia');
    }
    expect((await ticketsDe(unConsorcio.id)).length).toBe(antes);
  });

  it('pero "dale" con una confirmación pendiente SÍ registra el reporte', async () => {
    // La cortesía se ataja solo cuando no hay sesión abierta: ahí "dale" u "ok"
    // significan "sí, registralo", y tragárselos dejaría al vecino sin poder
    // confirmar.
    await bot.handle(msg(TEL_UNO, 'se rompió la cerradura del portón'));
    const r = await bot.handle(msg(TEL_UNO, 'dale'));
    expect(r.status).not.toBe('cortesia');
    expect(r.ticketId).toBeTruthy();
  });

  it('si el clasificador no encuentra un reporte, no inventa uno', async () => {
    // El segundo cinturón, para las frases que no están en la lista de cortesías:
    // el modelo devuelve una intención distinta de REPORTE y el bot lo respeta.
    // Sin esto,
    // "No te dije gracias!" terminaba como un ticket de CONDUCTA titulado
    // "Agradecimiento no expresado".
    const antes = (await ticketsDe(unConsorcio.id)).length;
    for (const texto of ['No te dije gracias!', 'hola, todo bien?', 'hola como andas']) {
      const r = await bot.handle(msg(TEL_UNO, texto));
      expect(r.status).toBe('sin-reporte');
      expect(r.ticketId).toBe('');
    }
    expect((await ticketsDe(unConsorcio.id)).length).toBe(antes);
  });

  it('un mensaje vacío no crea un ticket vacío', async () => {
    const r = await bot.handle(msg(TEL_UNO, '   '));
    expect(r.status).toBe('empty');
  });
});

describe('dedup (RF-B07)', () => {
  it('ante un reporte casi idéntico ofrece sumar el voto en vez de duplicar', async () => {
    const texto = 'la luz del palier del primer piso está quemada hace tres días';
    await bot.handle(msg(TEL_UNO, texto));
    const primero = await bot.handle(msg(TEL_UNO, 'sí'));
    expect(primero.ticketId).toBeTruthy();

    // Mismo texto, mismo consorcio: el embedder mock es determinístico.
    const segundo = await bot.handle(msg(TEL_UNO, texto));
    expect(segundo.status).toBe('dedup-offered');
    expect(segundo.ticketId).toBe(primero.ticketId);
  });
});

void and;
void clasificacionIa;
