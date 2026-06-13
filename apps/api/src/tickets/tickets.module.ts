import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SimilarTicketsController } from './similar.controller.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { VotosService } from './votos.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [TicketsController, SimilarTicketsController],
  providers: [TicketsService, VotosService],
})
export class TicketsModule {}
