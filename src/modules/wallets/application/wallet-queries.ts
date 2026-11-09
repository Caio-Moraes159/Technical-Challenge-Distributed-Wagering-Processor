import { MikroORM, type SqlEntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidRequestError,
  WalletNotFoundError,
} from '../../shared/domain/errors.js';
import {
  LedgerRepository,
  WalletRepository,
  type LedgerPage,
} from '../infrastructure/repositories.js';
import type { Wallet } from '../domain/wallet.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value))
    throw new InvalidRequestError(`${field} must be a UUID`);
}

@Injectable()
export class WalletQueries {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  async getWallet(walletId: string): Promise<Wallet> {
    assertUuid(walletId, 'walletId');
    const wallet = await new WalletRepository(
      this.orm.em.fork() as SqlEntityManager,
    ).findById(walletId);
    if (!wallet) throw new WalletNotFoundError(`wallet ${walletId} not found`);
    return wallet;
  }

  async listLedger(
    walletId: string,
    rawLimit?: string,
    cursor?: string,
  ): Promise<LedgerPage> {
    await this.getWallet(walletId);
    let limit = 50;
    if (rawLimit !== undefined) {
      limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new InvalidRequestError(
          'limit must be an integer between 1 and 100',
        );
      }
    }
    return new LedgerRepository(
      this.orm.em.fork() as SqlEntityManager,
    ).listByWallet(walletId, limit, cursor);
  }
}
