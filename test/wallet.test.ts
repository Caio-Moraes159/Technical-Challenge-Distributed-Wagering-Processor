import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  CurrencyMismatchError,
  InsufficientFundsError,
  InvalidRequestError,
  InvariantViolationError,
} from '../src/modules/shared/domain/errors.js';
import { Money } from '../src/modules/shared/domain/money.js';
import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../src/modules/wallets/domain/ledger-entry.js';
import { Wallet } from '../src/modules/wallets/domain/wallet.js';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const newWallet = (initial = '100.00') =>
  Wallet.open({
    id: randomUUID(),
    playerId: 'player-1',
    initialBalance: brl(initial),
  });

describe('Wallet', () => {
  it('abre com version 1 e o saldo inicial', () => {
    const w = newWallet();
    expect(w.version).toBe(1);
    expect(w.balance.amount).toBe('100.00');
  });

  it('debit reduz saldo, incrementa version e devolve lançamento balanceado', () => {
    const w = newWallet();
    const entry = w.debit(brl('80.00'), randomUUID());
    expect(w.balance.amount).toBe('20.00');
    expect(w.version).toBe(2);
    expect(entry.direction).toBe(LedgerDirection.Debit);
    expect(entry.balanceBefore.amount).toBe('100.00');
    expect(entry.balanceAfter.amount).toBe('20.00');
    expect(entry.isBalanced()).toBe(true);
  });

  it('credit aumenta saldo', () => {
    const w = newWallet('10.00');
    const entry = w.credit(brl('5.50'), randomUUID());
    expect(w.balance.amount).toBe('15.50');
    expect(entry.direction).toBe(LedgerDirection.Credit);
  });

  it('saldo insuficiente: lança e NÃO altera estado (nem version)', () => {
    const w = newWallet('20.00');
    expect(() => w.debit(brl('80.00'), randomUUID())).toThrow(
      InsufficientFundsError,
    );
    expect(w.balance.amount).toBe('20.00');
    expect(w.version).toBe(1);
  });

  it('pode zerar o saldo exatamente', () => {
    const w = newWallet('80.00');
    w.debit(brl('80.00'), randomUUID());
    expect(w.balance.amount).toBe('0.00');
  });

  it('moeda diferente da wallet é erro de domínio', () => {
    const w = newWallet();
    const usd = Money.from({ amount: '1.00', currency: 'USD' });
    expect(() => w.debit(usd, randomUUID())).toThrow(CurrencyMismatchError);
    expect(() => w.credit(usd, randomUUID())).toThrow(CurrencyMismatchError);
  });

  it('valor zero não movimenta saldo', () => {
    expect(() => newWallet().debit(brl('0.00'), randomUUID())).toThrow(
      InvalidRequestError,
    );
  });

  it('rehydrate não revalida e preserva o estado', () => {
    const w = newWallet();
    const copy = Wallet.rehydrate({
      id: w.id,
      playerId: w.playerId,
      currency: w.currency,
      balance: w.balance,
      version: 7,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    });
    expect(copy.version).toBe(7);
  });
});

describe('WalletLedgerEntry', () => {
  const base = {
    id: randomUUID(),
    walletId: randomUUID(),
    transactionId: randomUUID(),
    createdAt: new Date(),
  };

  it('create rejeita lançamento que não fecha a conta', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...base,
        direction: LedgerDirection.Debit,
        money: brl('10.00'),
        balanceBefore: brl('100.00'),
        balanceAfter: brl('85.00'),
      }),
    ).toThrow(InvariantViolationError);
  });

  it('create aceita lançamento correto', () => {
    const e = WalletLedgerEntry.create({
      ...base,
      direction: LedgerDirection.Credit,
      money: brl('10.00'),
      balanceBefore: brl('100.00'),
      balanceAfter: brl('110.00'),
    });
    expect(e.isBalanced()).toBe(true);
  });
});
