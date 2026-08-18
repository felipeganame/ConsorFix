export const QUEUE_PROCESS_INCOMING = 'process-incoming-message';

export interface ProcessIncomingJob {
  wamid: string;
  from: string;
  kind: 'text' | 'audio' | 'image' | 'other';
  text?: string;
  mediaId?: string;
  /** Canal de origen; ausente = whatsapp (compatibilidad con jobs viejos). */
  channel?: 'whatsapp' | 'telegram';
  /** chat_id de Telegram cuando el canal no identifica por teléfono. */
  externalId?: string;
  /** Teléfono verificado por la plataforma al compartir contacto. */
  contactPhone?: string;
  receivedAt: string;
}
