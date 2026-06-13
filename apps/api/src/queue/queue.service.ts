import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_PROCESS_INCOMING, type ProcessIncomingJob } from './queue.constants.js';

/**
 * BullMQ producer (Phase 2.3). Reemplaza el `setImmediate` con persistencia
 * y reintentos exponenciales. El worker (apps/worker) consume y delega al
 * BotService vía HTTP `/internal/bot/process`.
 *
 * NOTA: usamos `any`-casts puntuales por mismatch de versión transitiva de
 * ioredis entre bullmq y la dependencia directa. La compatibilidad en runtime
 * es 100% — sólo tsc se queja por nominal typing.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly log = new Logger(QueueService.name);
  private readonly connection: IORedis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly processIncoming: Queue<any>;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.processIncoming = new Queue(QUEUE_PROCESS_INCOMING, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connection: this.connection as any,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000, age: 60 * 60 * 24 },
        removeOnFail: { count: 5000 },
      },
    });
  }

  /** Persistent enqueue. Idempotente vía jobId = wamid (UNIQUE en webhook_event). */
  async enqueueIncoming(job: ProcessIncomingJob, opts: JobsOptions = {}): Promise<void> {
    try {
      await this.processIncoming.add('process', job, { jobId: `wa:${job.wamid}`, ...opts });
    } catch (err) {
      this.log.error({ err: (err as Error).message, wamid: job.wamid }, 'enqueue failed');
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.processIncoming.close();
    await this.connection.quit();
  }
}
