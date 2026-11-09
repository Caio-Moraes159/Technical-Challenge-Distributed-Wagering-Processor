import { createHash, randomUUID } from 'node:crypto';
import { MikroORM, type SqlEntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidRequestError,
  WalletAlreadyExistsError,
} from '../../shared/domain/errors.js';
import { Money } from '../../shared/domain/money.js';
import { LedgerDirection, WalletLedgerEntry } from '../domain/ledger-entry.js';
import { Wallet } from '../domain/wallet.js';
import {
  LedgerRepository,
  TransactionRowRepository,
  WalletRepository,
} from '../infrastructure/repositories.js';

export interface CreateWalletInput {
  playerId: unknown;
  initialBalance: unknown;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  async execute(input: CreateWalletInput): Promise<Wallet> {
    if (typeof input.playerId !== 'string' || input.playerId.trim() === '') {
      throw new InvalidRequestError('playerId is required');
    }

    const initial = Money.from(
      input.initialBalance as { amount: string; currency: string },
    );

    const wallet = Wallet.open({
      id: randomUUID(),
      playerId: input.playerId,
      initialBalance: initial,
    });

    await this.orm.em.transactional(async (tx) => {
      const em = tx as SqlEntityManager;

      const inserted = await new WalletRepository(em).insert(wallet);
      if (!inserted) {
        throw new WalletAlreadyExistsError(
          `wallet already exists for player/currency`,
        );
      }

      if (initial.isPositive()) {
        const now = wallet.createdAt;
        const txId = randomUUID();

        await new TransactionRowRepository(em).insert({
          id: txId,
          providerId: 'internal',
          externalTransactionId: `opening:${wallet.id}`,
          idempotencyKey: `opening:${wallet.id}`,
          payloadHash: createHash('sha256')
            .update(`opening:${wallet.id}:${initial.amount}`)
            .digest('hex'),
          walletId: wallet.id,
          playerId: wallet.playerId,
          roundId: 'opening',
          gameId: 'opening',
          kind: 'OPENING',
          money: initial,
          status: 'PROCESSED',
          balanceAfter: initial,
          createdAt: now,
          processedAt: now,
        });

        await new LedgerRepository(em).insert(
          WalletLedgerEntry.create({
            id: randomUUID(),
            walletId: wallet.id,
            transactionId: txId,
            direction: LedgerDirection.Credit,
            money: initial,
            balanceBefore: Money.zero(initial.currency),
            balanceAfter: initial,
            createdAt: now,
          }),
        );
      }
    });

    return wallet;
  }
}
