/**
 * Demo del flujo mínimo del producto, de punta a punta y en el orden en que
 * pasa en la realidad:
 *
 *   una administradora → su edificio → un vecino asignado a una unidad →
 *   el vecino reclama por chat → la IA clasifica → el bot le contesta →
 *   el reclamo aparece en la bandeja de la administradora
 *
 * Sirve para ver el producto funcionando sin abrir cinco pantallas, y para
 * mostrarlo en la defensa. Llama a `BotService` directamente, así que no
 * necesita firmar webhooks ni tener secretos del proveedor.
 *
 *   pnpm --filter @consorciofix/api exec tsx scripts/demo-flujo-minimo.ts
 */
import { and, eq, inArray } from 'drizzle-orm';
import { systemDb } from '../src/db/client.js';
import {
  clasificacionIa,
  consorcio,
  residente,
  tenant as tenantTable,
  ticket,
  unidad,
  vinculoResidente,
} from '../src/db/schema/index.js';
import { BotService } from '../src/bot/bot.service.js';
import { StorageService } from '../src/storage/storage.service.js';

const PREFIJO = `demo_${Date.now()}`;
const TELEFONO = `+5491${String(Date.now()).slice(-9)}`;
const MOCK_WHATSAPP = process.env.WHATSAPP_MOCK_URL ?? 'http://localhost:8081';

const G = '\x1b[32m';
const AZUL = '\x1b[36m';
const GRIS = '\x1b[90m';
const NEGRITA = '\x1b[1m';
const FIN = '\x1b[0m';

function paso(n: number, titulo: string): void {
  console.log(`\n${NEGRITA}${AZUL}${n}. ${titulo}${FIN}`);
}
function dato(k: string, v: string): void {
  console.log(`   ${GRIS}${k}:${FIN} ${v}`);
}

/** Lo que el bot le respondió al vecino, leído del mock de WhatsApp. */
async function respuestasDelBot(desde: number): Promise<string[]> {
  try {
    const r = await fetch(`${MOCK_WHATSAPP}/__outbox`);
    const todos = (await r.json()) as Array<{
      body?: { to?: string; text?: { body?: string }; type?: string };
    }>;
    return todos
      .slice(desde)
      .filter((m) => m.body?.type === 'text' && m.body?.text?.body)
      .map((m) => m.body!.text!.body!);
  } catch {
    return ['(no pude leer el mock de WhatsApp — ¿está levantado el docker compose?)'];
  }
}

async function cuantosEnviados(): Promise<number> {
  try {
    const r = await fetch(`${MOCK_WHATSAPP}/__outbox`);
    return ((await r.json()) as unknown[]).length;
  } catch {
    return 0;
  }
}

let idTenant = '';

async function main(): Promise<void> {
  const bot = new BotService(new StorageService());

  // ── 1. La administradora y su edificio ────────────────────────────────
  paso(1, 'Una administradora contrata el sistema y carga su edificio');

  const admin = (
    await systemDb
      .insert(tenantTable)
      .values({ nombre: `${PREFIJO} Administración Rivadavia`, plan: 'basico' })
      .returning()
  )[0]!;
  idTenant = admin.id;
  dato('administración', admin.nombre);

  const edificio = (
    await systemDb
      .insert(consorcio)
      .values({ tenantId: admin.id, nombre: `${PREFIJO} Belgrano 1234`, tipo: 'EDIFICIO' })
      .returning()
  )[0]!;
  dato('edificio', edificio.nombre);

  const depto = (
    await systemDb
      .insert(unidad)
      .values({ tenantId: admin.id, consorcioId: edificio.id, etiqueta: '3B' })
      .returning()
  )[0]!;
  dato('unidad', depto.etiqueta);

  // ── 2. El vecino asignado a esa unidad ────────────────────────────────
  paso(2, 'La administradora asigna un vecino a esa unidad');

  const vecino = (
    await systemDb
      .insert(residente)
      .values({ tenantId: admin.id, nombre: 'Carla Domínguez', telefonoE164: TELEFONO })
      .returning()
  )[0]!;
  await systemDb.insert(vinculoResidente).values({
    tenantId: admin.id,
    residenteId: vecino.id,
    unidadId: depto.id,
    rol: 'PROPIETARIO',
    activo: true,
  });
  dato('vecino', `${vecino.nombre} — propietaria de la ${depto.etiqueta}`);
  dato('teléfono', TELEFONO);

  // ── 3. El vecino reclama por chat ─────────────────────────────────────
  paso(3, 'La vecina le escribe al bot, en lenguaje suelto');

  const antes = await cuantosEnviados();
  const mensaje = 'hola, hace dos días que el portón del garage no cierra bien y queda abierto de noche';
  console.log(`\n   ${NEGRITA}Carla:${FIN} ${mensaje}`);

  const r1 = await bot.handle({
    wamid: `${PREFIJO}_msg1`,
    from: TELEFONO as `+${string}`,
    kind: 'text',
    text: mensaje,
    receivedAt: new Date(),
  });

  for (const t of await respuestasDelBot(antes)) {
    console.log(`\n   ${NEGRITA}${G}Bot:${FIN} ${t.replace(/\n/g, '\n        ')}`);
  }
  dato('\n   estado interno', r1.status);

  // ── 4. Qué entendió la IA ─────────────────────────────────────────────
  paso(4, 'Qué entendió la IA del mensaje (sugerencia, no decisión)');

  const antes2 = await cuantosEnviados();
  const r2 = await bot.handle({
    wamid: `${PREFIJO}_msg2`,
    from: TELEFONO as `+${string}`,
    kind: 'text',
    text: 'sí',
    receivedAt: new Date(),
  });
  console.log(`\n   ${NEGRITA}Carla:${FIN} sí`);
  for (const t of await respuestasDelBot(antes2)) {
    console.log(`\n   ${NEGRITA}${G}Bot:${FIN} ${t.replace(/\n/g, '\n        ')}`);
  }

  if (!r2.ticketId) {
    console.log('\n   (no se creó el ticket; estado:', r2.status, ')');
    return;
  }

  const ia = (
    await systemDb.select().from(clasificacionIa).where(eq(clasificacionIa.ticketId, r2.ticketId))
  )[0];
  if (ia) {
    const sug = ia.sugerido as Record<string, unknown>;
    console.log('');
    dato('categoría sugerida', String(sug.categoria));
    dato('origen sugerido', String(sug.origen));
    dato('urgencia sugerida', String(sug.urgencia));
    dato('confianza', `${Math.round((ia.confianza ?? 0) * 100)}%`);
    dato('modelo', `${ia.modelo} (prompt ${ia.promptVersion})`);
    console.log(
      `   ${GRIS}nota:${FIN} con AI_PROVIDER=mock el modelo es un stub local. Con una key real acá van las respuestas del LLM.`,
    );
  }

  // ── 5. El reclamo en la bandeja de la administradora ──────────────────
  paso(5, 'El reclamo ya está en la bandeja de la administradora');

  const t = (await systemDb.select().from(ticket).where(eq(ticket.id, r2.ticketId)))[0]!;
  dato('título', t.titulo);
  dato('estado', t.estado);
  dato('urgencia', t.urgencia);
  dato('edificio', edificio.nombre);
  dato('unidad', depto.etiqueta);
  dato('quién reportó', vecino.nombre);
  dato('cómo llegó', 'chat — la vecina no llenó ningún formulario');

  console.log(`\n${NEGRITA}${G}Ese es el producto.${FIN} Todo lo demás —costos, votos, métricas,`);
  console.log('conducta, importar planillas— está construido alrededor de este flujo.\n');
}

main()
  .then(async () => {
    // La demo se limpia sola: borrar la administración arrastra todo en cascada.
    if (idTenant) await systemDb.delete(tenantTable).where(eq(tenantTable.id, idTenant));
    console.log(`${GRIS}(datos de la demo eliminados)${FIN}`);
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nla demo falló:', err);
    if (idTenant) {
      await systemDb.delete(tenantTable).where(eq(tenantTable.id, idTenant)).catch(() => undefined);
    }
    process.exit(1);
  });

void and;
void inArray;
void unidad;
