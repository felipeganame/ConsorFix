export const QUEUE_PROCESS_INCOMING = 'process-incoming-message';

export interface ProcessIncomingJob {
  wamid: string;
  from: string;
  kind: 'text' | 'audio' | 'image' | 'other';
  text?: string;
  mediaId?: string;
  receivedAt: string;
}
