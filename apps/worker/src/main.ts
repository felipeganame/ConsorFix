import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const QUEUE_PROCESS_INCOMING = 'process-incoming-message';

interface ProcessIncomingJob {
  wamid: string;
  from: string;
  kind: 'text' | 'audio' | 'image' | 'other';
  text?: string;
  mediaId?: string;
  receivedAt: string;
}

const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
const internalToken = process.env.INTERNAL_TOKEN ?? '';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? '4');

if (!internalToken) {
  log.warn('INTERNAL_TOKEN no seteado — el worker no podrá invocar /internal/bot/process');
}

async function processJob(job: Job<ProcessIncomingJob>): Promise<{ status: string; ticketId?: string }> {
  log.info({ jobId: job.id, wamid: job.data.wamid, kind: job.data.kind }, 'processing job');
  const res = await fetch(`${apiUrl}/internal/bot/process`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-token': internalToken,
    },
    body: JSON.stringify(job.data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`/internal/bot/process ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as { status: string; ticketId?: string };
}

async function main(): Promise<void> {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const worker = new Worker<ProcessIncomingJob>(QUEUE_PROCESS_INCOMING, processJob, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: connection as any,
    concurrency,
    autorun: true,
  });

  worker.on('completed', (job, result) => {
    log.info({ jobId: job.id, wamid: job.data.wamid, result }, 'job completed');
  });
  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, wamid: job?.data.wamid, err: err.message }, 'job failed');
  });
  worker.on('error', (err) => {
    log.error({ err: err.message }, 'worker error');
  });

  log.info({ queue: QUEUE_PROCESS_INCOMING, concurrency, apiUrl }, 'worker started');

  const shutdown = async (sig: string) => {
    log.info({ sig }, 'shutting down worker');
    await worker.close();
    await connection.quit();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error({ err }, 'worker boot failed');
  process.exit(1);
});
