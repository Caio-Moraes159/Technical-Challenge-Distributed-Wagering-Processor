import { InvariantViolationError } from '../../shared/domain/errors.js';
import { Money } from '../../shared/domain/money.js';

export enum LedgerDirection {
  Debit = 'DEBIT',
  Credit = 'CREDIT',
}

export interface LedgerEntryState {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    public readonly createdAt: Date,
  ) {}

  static create(s: LedgerEntryState): WalletLedgerEntry {
    const entry = WalletLedgerEntry.build(s);
    if (!s.money.isPositive()) {
      throw new InvariantViolationError('ledger entry amount must be > 0');
    }
    if (!entry.isBalanced()) {
      throw new InvariantViolationError('ledger entry is not balanced');
    }
    return entry;
  }

  static rehydrate(s: LedgerEntryState): WalletLedgerEntry {
    return WalletLedgerEntry.build(s);
  }

  isBalanced(): boolean {
    const expected =
      this.direction === LedgerDirection.Credit
        ? this.balanceBefore.add(this.money)
        : this.balanceBefore.subtract(this.money);
    return expected.equals(this.balanceAfter);
  }

  private static build(s: LedgerEntryState): WalletLedgerEntry {
    return new WalletLedgerEntry(
      s.id,
      s.walletId,
      s.transactionId,
      s.direction,
      s.money,
      s.balanceBefore,
      s.balanceAfter,
      s.createdAt,
    );
  }
}
