import { Module } from '@nestjs/common';
import { ConductaController, HistorialConductaController } from './conducta.controller.js';

@Module({
  controllers: [ConductaController, HistorialConductaController],
})
export class ConductaModule {}
