import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './errors.js';

const STATUS_BY_CODE: Record<string, number> = {
  INVALID_REQUEST: 400,
  INVALID_MONEY: 400,
  CURRENCY_MISMATCH: 422,
  INSUFFICIENT_FUNDS: 422,
  WALLET_NOT_FOUND: 404,
  WALLET_ALREADY_EXISTS: 409,
  INVARIANT_VIOLATION: 500,
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res
      .status(STATUS_BY_CODE[error.code] ?? 422)
      .json({ error: { code: error.code, message: error.message } });
  }
}
