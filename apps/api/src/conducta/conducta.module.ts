import { Module } from '@nestjs/common';
import { ConductaController } from './conducta.controller.js';

@Module({
  controllers: [ConductaController],
})
export class ConductaModule {}
