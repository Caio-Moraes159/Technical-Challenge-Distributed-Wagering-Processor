import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MikroORM, type SqlEntityManager } from '@mikro-orm/postgresql';
import { Money } from '../../modules/shared/domain/money.js';
import { InsufficientFundsError } from '../../modules/shared/domain/errors.js';
import { WagerTransaction } from '../domain/wager-transaction.js';
import {
  WalletRepository,
  LedgerRepository,
} from '../../modules/wallets/infrastructure/repositories.js';
import { WagerTransactionRepository } from '../infrastructure/wagering.repositories.js';

export interface ProcessWagerInput {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  amount: string;
  currency: string;
  referenceExternalTransactionId?: string;
}

@Injectable()
export class ProcessWagerUseCase {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  async execute(
    input: ProcessWagerInput,
  ): Promise<{ tx: WagerTransaction; idempotentReplay: boolean }> {
    const money = Money.from({
      amount: input.amount,
      currency: input.currency,
    });

    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          provider: input.providerId,
          extId: input.externalTransactionId,
          wallet: input.walletId,
          kind: input.kind,
          amt: input.amount,
          cur: input.currency,
          ref: input.referenceExternalTransactionId,
        }),
      )
      .digest('hex');

    return this.orm.em.transactional(async (emTx) => {
      const em = emTx as SqlEntityManager;
      const txRepo = new WagerTransactionRepository(em);

      const existingTx = await txRepo.findByExternalId(
        input.providerId,
        input.externalTransactionId,
      );
      if (existingTx) {
        if (!existingTx.matchesPayload(payloadHash)) {
          throw new Error(
            'PAYLOAD_CONFLICT: Mesma chave de idempotência com dados divergentes',
          );
        }
        return { tx: existingTx, idempotentReplay: true };
      }

      const wager = WagerTransaction.create({
        id: randomUUID(),
        providerId: input.providerId,
        externalTransactionId: input.externalTransactionId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        walletId: input.walletId,
        playerId: input.playerId,
        roundId: input.roundId,
        gameId: input.gameId,
        kind: input.kind as any,
        money,
        referenceExternalTransactionId: input.referenceExternalTransactionId,
        createdAt: new Date(),
      });

      const walletRepo = new WalletRepository(em);
      const wallet = await walletRepo.lockById(wager.walletId);
      if (!wallet) {
        wager.fail('REFERENCE_NOT_FOUND');
        await txRepo.insert(wager);
        return { tx: wager, idempotentReplay: false };
      }

      const now = new Date();
      let ledgerEntry = undefined;

      try {
        if (wager.requiresReference()) {
          const refTx = await txRepo.findByExternalId(
            wager.providerId,
            wager.referenceExternalTransactionId!,
          );
          if (!refTx) {
            wager.markPendingReference();
          } else if (refTx.status !== 'PROCESSED') {
            wager.reject('REFERENCE_STATUS_INVALID');
          } else if (!refTx.money.equals(wager.money)) {
            wager.reject('AMOUNT_MISMATCH');
          } else {
            ledgerEntry =
              refTx.kind === 'BET' || refTx.kind === 'LOSS'
                ? wallet.credit(wager.money, wager.id, now)
                : wallet.debit(wager.money, wager.id, now);

            wager.markProcessed(now, refTx.id);
          }
        } else if (wager.kind === 'BET') {
          ledgerEntry = wallet.debit(wager.money, wager.id, now);
          wager.markProcessed(now);
        } else if (wager.kind === 'WIN') {
          ledgerEntry = wallet.credit(wager.money, wager.id, now);
          wager.markProcessed(now);
        } else if (wager.kind === 'LOSS') {
          wager.markProcessed(now);
        }
      } catch (error) {
        if (error instanceof InsufficientFundsError) {
          wager.reject('BET_INSUFFICIENT_FUNDS');
        } else {
          throw error;
        }
      }

      await txRepo.insert(wager);

      if (ledgerEntry && wager.status === 'PROCESSED') {
        await walletRepo.save(wallet);
        await new LedgerRepository(em).insert(ledgerEntry);
      }

      return { tx: wager, idempotentReplay: false };
    });
  }
}
