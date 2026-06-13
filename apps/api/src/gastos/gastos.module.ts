import { Module } from '@nestjs/common';
import { GastosController } from './gastos.controller.js';
import { GastosService } from './gastos.service.js';

@Module({
  controllers: [GastosController],
  providers: [GastosService],
})
export class GastosModule {}
