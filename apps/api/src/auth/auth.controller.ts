import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from './auth.guard.js';
import { AuthService } from './auth.service.js';

const LoginDto = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const RefreshDto = z.object({
  refreshToken: z.string().min(10),
});

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Throttle agresivo: 10 intentos por minuto por IP en login.
  // Mitiga brute-force (RNF-04, OWASP A07:2021).
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  async login(@Body() body: unknown) {
    const { email, password } = LoginDto.parse(body);
    return this.auth.login(email, password);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('refresh')
  async refresh(@Body() body: unknown) {
    const { refreshToken } = RefreshDto.parse(body);
    return this.auth.refresh(refreshToken);
  }
}
