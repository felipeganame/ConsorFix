import type { IMessagingProvider } from '../ports.js';
import { MockWhatsAppProvider } from './mock-adapter.js';
import { WhatsAppCloudProvider } from './cloud-adapter.js';

/**
 * Picks a messaging provider based on env config.
 * `WHATSAPP_PROVIDER=cloud` requires credentials; otherwise falls back to mock
 * (which talks to docker-compose `mock-whatsapp`).
 */
export function createWhatsAppProvider(): IMessagingProvider {
  const kind = process.env.WHATSAPP_PROVIDER ?? 'mock';
  if (kind === 'cloud') {
    return new WhatsAppCloudProvider(
      process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
      process.env.WHATSAPP_ACCESS_TOKEN ?? '',
      process.env.WHATSAPP_APP_SECRET ?? '',
    );
  }
  return new MockWhatsAppProvider();
}
