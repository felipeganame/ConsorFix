import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@consorciofix/domain';
import { ZodError } from 'zod';

/**
 * Mapea DomainError y ZodError a respuestas HTTP estructuradas (RFC 7807).
 * Sin esto, los errores de dominio salen como 500 genéricos.
 */
@Catch(DomainError, ZodError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(err: DomainError | ZodError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof ZodError) {
      res.status(HttpStatus.BAD_REQUEST).json({
        type: 'about:blank',
        title: 'Validation failed',
        status: 400,
        detail: 'Invalid request body',
        errors: err.issues,
      });
      return;
    }
    res.status(HttpStatus.BAD_REQUEST).json({
      type: `about:blank`,
      title: err.code,
      status: 400,
      detail: err.message,
      ...(err.details && { extensions: err.details }),
    });
  }
}
