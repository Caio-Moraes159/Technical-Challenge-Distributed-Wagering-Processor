import { randomUUID } from 'node:crypto';
import {
  CurrencyMismatchError,
  InsufficientFundsError,
  InvalidRequestError,
} from '../../shared/domain/errors.js';
import { Money } from '../../shared/domain/money.js';
import { LedgerDirection, WalletLedgerEntry } from './ledger-entry.js';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
    now?: Date;
  }): Wallet {
    if (props.playerId.trim() === '')
      throw new InvalidRequestError('playerId is required');
    if (props.initialBalance.isNegative())
      throw new InvalidRequestError('initial balance < 0');
    const now = props.now ?? new Date();
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(s: WalletState): Wallet {
    return new Wallet(
      s.id,
      s.playerId,
      s.currency,
      s.balance,
      s.version,
      s.createdAt,
      s.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }
  get version(): number {
    return this._version;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(
    money: Money,
    transactionId: string,
    now: Date = new Date(),
  ): WalletLedgerEntry {
    this.assertMovable(money);
    const after = this._balance.subtract(money);
    if (after.isNegative()) {
      throw new InsufficientFundsError(`balance ${this._balance} < ${money}`);
    }
    return this.apply(LedgerDirection.Debit, money, after, transactionId, now);
  }

  credit(
    money: Money,
    transactionId: string,
    now: Date = new Date(),
  ): WalletLedgerEntry {
    this.assertMovable(money);
    return this.apply(
      LedgerDirection.Credit,
      money,
      this._balance.add(money),
      transactionId,
      now,
    );
  }

  private apply(
    direction: LedgerDirection,
    money: Money,
    after: Money,
    transactionId: string,
    now: Date,
  ): WalletLedgerEntry {
    const entry = WalletLedgerEntry.create({
      id: randomUUID(),
      walletId: this.id,
      transactionId,
      direction,
      money,
      balanceBefore: this._balance,
      balanceAfter: after,
      createdAt: now,
    });
    this._balance = after;
    this._version += 1;
    this._updatedAt = now;
    return entry;
  }

  private assertMovable(money: Money): void {
    this.assertSameCurrency(money);
    if (!money.isPositive())
      throw new InvalidRequestError('amount must be > 0');
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(
        `wallet is ${this.currency}, operation is ${money.currency}`,
      );
    }
  }
}
