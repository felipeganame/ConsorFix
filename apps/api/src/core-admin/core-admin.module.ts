import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriasController } from './categorias.controller.js';
import { ConsorciosController } from './consorcios.controller.js';
import { ResidentesController } from './residentes.controller.js';
import { UnidadesController } from './unidades.controller.js';
import { TenantsController } from './tenants.controller.js';
import { VinculosController } from './vinculos.controller.js';

@Module({
  // AuthModule por PasswordService (crear el primer admin del tenant).
  // AuditModule es @Global, no hace falta importarlo.
  imports: [AuthModule],
  controllers: [
    TenantsController,
    ConsorciosController,
    UnidadesController,
    ResidentesController,
    VinculosController,
    CategoriasController,
  ],
})
export class CoreAdminModule {}
