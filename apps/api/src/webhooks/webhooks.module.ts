import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module.js';
import { WhatsAppWebhookController } from './whatsapp.controller.js';

@Module({
  imports: [BotModule],
  controllers: [WhatsAppWebhookController],
})
export class WebhooksModule {}
