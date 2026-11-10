import type { SqlEntityManager } from '@mikro-orm/postgresql';
import { WagerTransaction } from '../domain/wager-transaction.js';
import { Money } from '../../modules/shared/domain/money.js';
import type { OutboxMessage } from '../../modules/outbox/domain/outbox-message.js';
import { InboxMessage } from '../domain/inbox-message.js';

export class WagerTransactionRepository {
  constructor(private readonly em: SqlEntityManager) {}

  async findByExternalId(
    providerId: string,
    externalId: string,
  ): Promise<WagerTransaction | undefined> {
    const rows = await this.em.execute<any[]>(
      `SELECT * FROM wager_transactions WHERE provider_id = ? AND external_transaction_id = ?`,
      [providerId, externalId],
    );

    if (rows.length === 0) return undefined;
    const r = rows[0];

    return (WagerTransaction as any).create({
      id: r.id,
      providerId: r.provider_id,
      externalTransactionId: r.external_transaction_id,
      idempotencyKey: r.idempotency_key,
      payloadHash: r.payload_hash,
      walletId: r.wallet_id,
      playerId: r.player_id,
      roundId: r.round_id,
      gameId: r.game_id,
      kind: r.kind,
      money: Money.from({ amount: r.amount, currency: r.currency }),
      referenceExternalTransactionId: r.reference_external_transaction_id,
      createdAt: new Date(r.created_at),
    });
  }

  async insert(tx: WagerTransaction): Promise<void> {
    await this.em.execute(
      `INSERT INTO wager_transactions
        (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id, round_id, game_id, kind, amount, currency, status, failure_code, created_at, processed_at, reference_external_transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        failure_code = EXCLUDED.failure_code,
        processed_at = EXCLUDED.processed_at`,
      [
        tx.id,
        tx.providerId,
        tx.externalTransactionId,
        tx.idempotencyKey,
        tx.payloadHash,
        tx.walletId,
        tx.playerId,
        tx.roundId,
        tx.gameId,
        tx.kind,
        tx.money.amount,
        tx.money.currency,
        tx.status,
        tx.failureCode ?? null,
        tx.createdAt,
        tx.processedAt ?? null,
        tx.referenceExternalTransactionId ?? null,
      ],
    );
  }
}

export class OutboxRepository {
  constructor(private readonly em: SqlEntityManager) {}

  async insert(msg: OutboxMessage): Promise<void> {
    await this.em.execute(
      `INSERT INTO outbox_messages (id, aggregate_id, event_type, payload, occurred_at, attempts)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        msg.id,
        msg.aggregateId,
        msg.eventType,
        JSON.stringify(msg.payload),
        msg.occurredAt,
        msg.attempts,
      ],
    );
  }
}

export class InboxRepository {
  constructor(private readonly em: SqlEntityManager) {}

  async find(
    messageId: string,
    consumerName: string,
  ): Promise<InboxMessage | undefined> {
    const rows = await this.em.execute<any[]>(
      `SELECT * FROM inbox_messages WHERE message_id = ? AND consumer_name = ?`,
      [messageId, consumerName],
    );
    if (rows.length === 0) return undefined;

    const r = rows[0];
    const msg = InboxMessage.receive(
      r.message_id,
      r.consumer_name,
      r.payload_hash,
    );
    if (r.processed_at) msg.markProcessed(new Date(r.processed_at));
    return msg;
  }

  async insert(msg: InboxMessage): Promise<void> {
    await this.em.execute(
      `INSERT INTO inbox_messages (message_id, consumer_name, payload_hash, received_at, processed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (message_id, consumer_name) DO UPDATE SET processed_at = EXCLUDED.processed_at`,
      [
        msg.messageId,
        msg.consumerName,
        msg.payloadHash,
        msg.receivedAt,
        msg.processedAt ?? null,
      ],
    );
  }
}
