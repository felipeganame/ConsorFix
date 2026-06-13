import * as argon2 from 'argon2';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PasswordService {
  // Tuned per OWASP recommended Argon2id parameters (2024).
  // memoryCost is in KiB (64 MiB).
  private readonly opts: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  };

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.opts);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain, this.opts);
    } catch {
      return false;
    }
  }
}
