import { IntegrationEvent } from './types.js';
import type { WagerTransaction } from './wager-transaction.js';

export class WagerTransactionProcessed extends IntegrationEvent<
  Record<string, any>
> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  static from(tx: WagerTransaction): WagerTransactionProcessed {
    return new WagerTransactionProcessed(
      tx.id,
      tx.walletId,
      tx.idempotencyKey,
      tx.processedAt ?? new Date(),
      {
        transactionId: tx.id,
        providerId: tx.providerId,
        externalId: tx.externalTransactionId,
        status: tx.status,
        kind: tx.kind,
        amount: tx.money.toJSON(),
      },
    );
  }
}

export class WagerTransactionRejected extends IntegrationEvent<
  Record<string, any>
> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  static from(tx: WagerTransaction): WagerTransactionRejected {
    return new WagerTransactionRejected(
      tx.id,
      tx.walletId,
      tx.idempotencyKey,
      new Date(),
      {
        transactionId: tx.id,
        providerId: tx.providerId,
        status: tx.status,
        failureCode: tx.failureCode,
      },
    );
  }
}
