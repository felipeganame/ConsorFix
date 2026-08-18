import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module.js';
import { WhatsAppWebhookController } from './whatsapp.controller.js';
import { TelegramWebhookController } from './telegram.controller.js';

@Module({
  imports: [BotModule],
  controllers: [WhatsAppWebhookController, TelegramWebhookController],
})
export class WebhooksModule {}
