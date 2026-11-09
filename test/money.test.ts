import { describe, expect, it } from 'bun:test';
import {
  CurrencyMismatchError,
  InvalidMoneyError,
} from '../src/modules/shared/domain/errors.js';
import { Money } from '../src/modules/shared/domain/money.js';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });

describe('Money.from', () => {
  it('normaliza para escala fixa de 2 casas', () => {
    expect(brl('25').amount).toBe('25.00');
    expect(brl('25.5').amount).toBe('25.50');
    expect(brl('25.00').toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
  });

  it.each([
    [''],
    ['NaN'],
    ['Infinity'],
    ['1e3'],
    ['-1.00'],
    ['1.234'],
    [' 1.00'],
    ['1,00'],
    ['.5'],
    ['0x10'],
  ])('rejeita amount inválido: %p', (amount) => {
    expect(() => brl(amount)).toThrow(InvalidMoneyError);
  });

  it('rejeita amount que não seja string (nunca number)', () => {
    expect(() =>
      Money.from({ amount: 25 as unknown as string, currency: 'BRL' }),
    ).toThrow(InvalidMoneyError);
  });

  it.each([['brl'], ['BR'], ['BRLL'], ['']])(
    'rejeita moeda inválida: %p',
    (currency) => {
      expect(() => Money.from({ amount: '1.00', currency })).toThrow(
        InvalidMoneyError,
      );
    },
  );
});

describe('Money aritmética', () => {
  it('não sofre de erro de ponto flutuante (0.10 + 0.20 = 0.30)', () => {
    expect(brl('0.10').add(brl('0.20')).amount).toBe('0.30');
  });

  it('é imutável: operações devolvem nova instância', () => {
    const a = brl('10.00');
    const b = a.add(brl('5.00'));
    expect(a.amount).toBe('10.00');
    expect(b.amount).toBe('15.00');
  });

  it('subtract pode dar negativo internamente (o Wallet decide rejeitar)', () => {
    const r = brl('20.00').subtract(brl('80.00'));
    expect(r.isNegative()).toBe(true);
    expect(r.amount).toBe('-60.00');
  });

  it('zero negado continua "0.00" (sem -0)', () => {
    expect(Money.zero('BRL').negate().amount).toBe('0.00');
    expect(brl('5.00').subtract(brl('5.00')).amount).toBe('0.00');
  });

  it('comparações', () => {
    expect(brl('1.00').isLessThan(brl('2.00'))).toBe(true);
    expect(brl('1.00').equals(brl('1.0'))).toBe(true);
    expect(brl('0.00').isZero()).toBe(true);
    expect(brl('0.01').isPositive()).toBe(true);
  });
});

describe('Money moedas diferentes', () => {
  const usd = Money.from({ amount: '1.00', currency: 'USD' });
  it('add/subtract/isLessThan lançam erro de domínio', () => {
    expect(() => brl('1.00').add(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl('1.00').subtract(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl('1.00').isLessThan(usd)).toThrow(CurrencyMismatchError);
  });
  it('equals entre moedas diferentes é false (não lança)', () => {
    expect(brl('1.00').equals(usd)).toBe(false);
  });
});
