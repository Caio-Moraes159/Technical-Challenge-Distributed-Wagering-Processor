export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
}
export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';
}
export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';
}
export class InvalidRequestError extends DomainError {
  readonly code = 'INVALID_REQUEST';
}
export class InvariantViolationError extends DomainError {
  readonly code = 'INVARIANT_VIOLATION';
}
export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND';
}
export class WalletAlreadyExistsError extends DomainError {
  readonly code = 'WALLET_ALREADY_EXISTS';
}
