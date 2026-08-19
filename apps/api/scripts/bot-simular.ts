/**
 * Simula que un vecino le escribe al bot, sin necesitar WhatsApp ni Telegram.
 *
 * Es la herramienta que faltaba para ver el producto funcionando con datos
 * propios: los canales reales exigen credenciales del proveedor y una URL
 * pública que Telegram pueda alcanzar, y para probar la conversación eso es
 * andamiaje puro. Acá se llama a `BotService.handle` con el mismo objeto que
 * armaría el webhook, así que el recorrido es idéntico salvo el transporte.
 *
 *   pnpm bot "+5435111111" "se rompió el portón del garage"
 *   pnpm bot "+5435111111" "sí"          # para confirmar el reporte
 *
 * Las respuestas del bot se leen del outbox del mock de WhatsApp, que es lo que
 * captura los mensajes salientes en desarrollo.
 */
import { BotService } from '../src/bot/bot.service.js';
import { StorageService } from '../src/storage/storage.service.js';

const MOCK_WHATSAPP = process.env.WHATSAPP_MOCK_URL ?? 'http://localhost:8081';

const G = '\x1b[32m';
const GRIS = '\x1b[90m';
const NEGRITA = '\x1b[1m';
const FIN = '\x1b[0m';

async function enviados(): Promise<number> {
  try {
    const r = await fetch(`${MOCK_WHATSAPP}/__outbox`);
    return ((await r.json()) as unknown[]).length;
  } catch {
    return 0;
  }
}

async function respuestas(desde: number): Promise<string[]> {
  try {
    const r = await fetch(`${MOCK_WHATSAPP}/__outbox`);
    const todos = (await r.json()) as Array<{
      body?: { text?: { body?: string }; type?: string };
    }>;
    return todos
      .slice(desde)
      .filter((m) => m.body?.type === 'text' && m.body?.text?.body)
      .map((m) => m.body!.text!.body!);
  } catch {
    return [`${GRIS}(no pude leer el mock de WhatsApp — ¿está levantado docker compose?)${FIN}`];
  }
}

async function main(): Promise<void> {
  const [telefono, ...resto] = process.argv.slice(2);
  const texto = resto.join(' ');

  if (!telefono || !texto) {
    console.error('uso: pnpm bot "<telefono E.164>" "<mensaje>"');
    console.error('ej:  pnpm bot "+5491100000001" "se rompió el portón del garage"');
    process.exit(1);
  }

  const bot = new BotService(new StorageService());
  const antes = await enviados();

  console.log(`\n   ${NEGRITA}Vecino (${telefono}):${FIN} ${texto}`);

  const r = await bot.handle({
    // Un id distinto por mensaje: el webhook deduplica por este valor, así que
    // repetirlo haría que el segundo mensaje se descarte como reentrega.
    wamid: `sim_${Date.now()}_${Math.floor(process.hrtime()[1] / 1000)}`,
    from: telefono as `+${string}`,
    kind: 'text',
    text: texto,
    receivedAt: new Date(),
  });

  for (const t of await respuestas(antes)) {
    console.log(`\n   ${NEGRITA}${G}Bot:${FIN} ${t.replace(/\n/g, '\n        ')}`);
  }

  console.log(`\n   ${GRIS}estado: ${r.status}${r.ticketId ? ` · ticket ${r.ticketId.slice(0, 8)}` : ''}${FIN}`);
  if (r.status === 'unregistered') {
    console.log(
      `   ${GRIS}ese teléfono no está cargado como vecino. Revisá que coincida exactamente${FIN}`,
    );
    console.log(`   ${GRIS}con el de la sección Vecinos del panel, incluido el +54.${FIN}`);
  }
  if (r.status === 'awaiting-report-confirm') {
    console.log(`   ${GRIS}→ contestá con: pnpm bot "${telefono}" "sí"${FIN}`);
  }
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nfalló:', err);
    process.exit(1);
  });
