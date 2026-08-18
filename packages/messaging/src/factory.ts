import { createWhatsAppProvider } from './whatsapp/factory.js';
import { TelegramProvider } from './telegram/adapter.js';
import type { IMessagingProvider } from './ports.js';

export type Canal = 'whatsapp' | 'telegram';

/**
 * Resuelve el proveedor de mensajería del canal pedido.
 *
 * Los dos canales conviven: el sistema puede recibir por ambos a la vez, y
 * cada respuesta sale por el canal del que vino el mensaje. `MESSAGING_PROVIDER`
 * solo define el canal por defecto para lo que se origina del lado del sistema
 * (notificaciones salientes), no restringe la recepción.
 */
export function createMessagingProvider(canal?: Canal): IMessagingProvider {
  const elegido = canal ?? (process.env.MESSAGING_PROVIDER as Canal | undefined) ?? 'whatsapp';
  if (elegido === 'telegram') return new TelegramProvider();
  return createWhatsAppProvider();
}

/** True si Telegram está configurado y su webhook puede aceptarse. */
export function telegramHabilitado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);
}
