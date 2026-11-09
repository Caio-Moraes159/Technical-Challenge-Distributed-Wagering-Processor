import { Decimal } from 'decimal.js';
import { CurrencyMismatchError, InvalidMoneyError } from './errors.js';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

/** DTO de entrada/saída: sempre string decimal + moeda ISO-4217. */
export interface MoneyProps {
  amount: string;
  currency: string;
}

// Aceita "25", "25.5" ou "25.00". Rejeita: "", "NaN", "1e3", "-1", "1.234", " 1", "1,00".
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  /** Entrada externa (contratos): valida tudo. Negativos NÃO entram por aqui. */
  static from(props: MoneyProps): Money {
    if (props === null || typeof props !== 'object') {
      throw new InvalidMoneyError(
        'money must be an object { amount, currency }',
      );
    }
    const { amount, currency } = props;
    if (typeof amount !== 'string' || !AMOUNT_RE.test(amount)) {
      throw new InvalidMoneyError(
        'amount must be a non-negative decimal string with at most 2 decimal places',
      );
    }
    if (typeof currency !== 'string' || !CURRENCY_RE.test(currency)) {
      throw new InvalidMoneyError(
        'currency must be an ISO-4217 code, e.g. "BRL"',
      );
    }
    return Money.of(new D(amount), currency);
  }

  static zero(currency: string): Money {
    return Money.from({ amount: '0.00', currency });
  }

  /** Caminho interno: permite resultado negativo (ex.: saldo - aposta). Normaliza -0. */
  private static of(value: Decimal, currency: string): Money {
    return new Money(value.isZero() ? new D(0) : value, currency);
  }

  get amount(): string {
    return this.value.toFixed(2); // escala fixa de 2 casas
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return Money.of(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }
  isPositive(): boolean {
    return this.value.greaterThan(0);
  }
  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return { amount: this.amount, currency: this.currency };
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(
        `cannot mix ${this.currency} with ${other.currency}`,
      );
    }
  }
}
