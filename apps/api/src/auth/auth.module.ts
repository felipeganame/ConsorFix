import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtService } from './jwt.service.js';
import { PasswordService } from './password.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtService, PasswordService],
  exports: [AuthService, JwtService, PasswordService],
})
export class AuthModule {}
