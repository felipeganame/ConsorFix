import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { BotModule } from './bot/bot.module.js';
import { DomainErrorFilter } from './common/domain-error.filter.js';
import { ConductaModule } from './conducta/conducta.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ImportModule } from './import/import.module.js';
import { CoreAdminModule } from './core-admin/core-admin.module.js';
import { GastosModule } from './gastos/gastos.module.js';
import { HealthController } from './health/health.controller.js';
import { MeModule } from './me/me.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { QueueModule } from './queue/queue.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global: 60 req/min por IP (default). Auth tiene su propio
    // límite agresivo en el controller via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuditModule,
    AuthModule,
    QueueModule,
    TicketsModule,
    CoreAdminModule,
    ImportModule,
    StorageModule,
    ConductaModule,
    GastosModule,
    MeModule,
    MetricsModule,
    NotificationsModule,
    WebhooksModule,
    BotModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
