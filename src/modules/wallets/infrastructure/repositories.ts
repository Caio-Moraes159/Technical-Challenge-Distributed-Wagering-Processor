import type { SqlEntityManager } from '@mikro-orm/postgresql';
import { InvalidRequestError } from '../../shared/domain/errors.js';
import { Money } from '../../shared/domain/money.js';
import { LedgerDirection, WalletLedgerEntry } from '../domain/ledger-entry.js';
import { Wallet } from '../domain/wallet.js';

interface WalletRow {
  id: string;
  player_id: string;
  currency: string;
  balance: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const WALLET_COLS = `id, player_id, currency, balance::text as balance, version, created_at, updated_at`;

const toWallet = (r: WalletRow): Wallet =>
  Wallet.rehydrate({
    id: r.id,
    playerId: r.player_id,
    currency: r.currency.trim(),
    balance: Money.from({ amount: r.balance, currency: r.currency.trim() }),
    version: r.version,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  });

export class WalletRepository {
  constructor(private readonly em: SqlEntityManager) {}

  async insert(w: Wallet): Promise<boolean> {
    const rows = await this.em.execute<{ id: string }[]>(
      `insert into wallets (id, player_id, currency, balance, version, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict (player_id, currency) do nothing
       returning id`,
      [
        w.id,
        w.playerId,
        w.currency,
        w.balance.amount,
        w.version,
        w.createdAt,
        w.updatedAt,
      ],
    );
    return rows.length === 1;
  }

  async findById(id: string): Promise<Wallet | undefined> {
    const rows = await this.em.execute<WalletRow[]>(
      `select ${WALLET_COLS} from wallets where id = ?`,
      [id],
    );
    return rows[0] ? toWallet(rows[0]) : undefined;
  }

  async lockById(id: string): Promise<Wallet | undefined> {
    const rows = await this.em.execute<WalletRow[]>(
      `select ${WALLET_COLS} from wallets where id = ? for update`,
      [id],
    );
    return rows[0] ? toWallet(rows[0]) : undefined;
  }

  async save(w: Wallet): Promise<void> {
    await this.em.execute(
      `update wallets set balance = ?, version = ?, updated_at = ? where id = ?`,
      [w.balance.amount, w.version, w.updatedAt, w.id],
    );
  }
}

export interface TransactionRow {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: Money;
  status: string;
  failureCode?: string;
  balanceAfter?: Money;
  createdAt: Date;
  processedAt?: Date;
}

export class TransactionRowRepository {
  constructor(private readonly em: SqlEntityManager) {}

  async insert(t: TransactionRow): Promise<void> {
    await this.em.execute(
      `insert into wager_transactions
         (id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id,
          round_id, game_id, kind, amount, currency, status, failure_code, balance_after, created_at, processed_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.providerId,
        t.externalTransactionId,
        t.idempotencyKey,
        t.payloadHash,
        t.walletId,
        t.playerId,
        t.roundId,
        t.gameId,
        t.kind,
        t.money.amount,
        t.money.currency,
        t.status,
        t.failureCode ?? null,
        t.balanceAfter?.amount ?? null,
        t.createdAt,
        t.processedAt ?? null,
      ],
    );
  }
}

interface LedgerRow {
  id: string;
  seq: string;
  wallet_id: string;
  transaction_id: string;
  direction: LedgerDirection;
  amount: string;
  currency: string;
  balance_before: string;
  balance_after: string;
  created_at: Date;
}

const LEDGER_COLS = `id, seq::text as seq, wallet_id, transaction_id, direction, amount::text as amount, currency,
  balance_before::text as balance_before, balance_after::text as balance_after, created_at`;

const toEntry = (r: LedgerRow): WalletLedgerEntry => {
  const c = r.currency.trim();
  return WalletLedgerEntry.rehydrate({
    id: r.id,
    walletId: r.wallet_id,
    transactionId: r.transaction_id,
    direction: r.direction,
    money: Money.from({ amount: r.amount, currency: c }),
    balanceBefore: Money.from({ amount: r.balance_before, currency: c }),
    balanceAfter: Money.from({ amount: r.balance_after, currency: c }),
    createdAt: new Date(r.created_at),
  });
};

export interface LedgerPage {
  items: WalletLedgerEntry[];
  nextCursor?: string;
}

export class LedgerRepository {
  constructor(private readonly em: SqlEntityManager) {}

  async insert(e: WalletLedgerEntry): Promise<void> {
    await this.em.execute(
      `insert into wallet_ledger_entries
         (id, wallet_id, transaction_id, direction, amount, currency, balance_before, balance_after, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id,
        e.walletId,
        e.transactionId,
        e.direction,
        e.money.amount,
        e.money.currency,
        e.balanceBefore.amount,
        e.balanceAfter.amount,
        e.createdAt,
      ],
    );
  }

  async listByWallet(
    walletId: string,
    limit: number,
    cursor?: string,
  ): Promise<LedgerPage> {
    const params: unknown[] = [walletId];
    let where = 'wallet_id = ?';
    if (cursor !== undefined) {
      const seq = Buffer.from(cursor, 'base64url').toString('utf8');
      if (!/^\d+$/.test(seq)) throw new InvalidRequestError('invalid cursor');
      where += ' and seq < ?';
      params.push(seq);
    }
    params.push(limit + 1);
    const rows = await this.em.execute<LedgerRow[]>(
      `select ${LEDGER_COLS} from wallet_ledger_entries where ${where} order by seq desc limit ?`,
      params,
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toEntry),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(last.seq, 'utf8').toString('base64url')
          : undefined,
    };
  }

  async sumBalance(walletId: string, currency: string): Promise<Money> {
    const rows = await this.em.execute<{ total: string }[]>(
      `select coalesce(sum(case direction when 'CREDIT' then amount else -amount end), 0)::text as total
         from wallet_ledger_entries where wallet_id = ?`,
      [walletId],
    );

    const total = rows[0]?.total ?? '0';

    return Money.from({
      amount: Number(total) === 0 ? '0.00' : total,
      currency,
    });
  }
}
