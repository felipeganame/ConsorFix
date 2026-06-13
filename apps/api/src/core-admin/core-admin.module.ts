import { Module } from '@nestjs/common';
import { CategoriasController } from './categorias.controller.js';
import { ConsorciosController } from './consorcios.controller.js';
import { ResidentesController } from './residentes.controller.js';
import { UnidadesController } from './unidades.controller.js';
import { VinculosController } from './vinculos.controller.js';

@Module({
  controllers: [
    ConsorciosController,
    UnidadesController,
    ResidentesController,
    VinculosController,
    CategoriasController,
  ],
})
export class CoreAdminModule {}
