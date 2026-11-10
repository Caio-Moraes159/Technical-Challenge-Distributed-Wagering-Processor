import { InvalidRequestError } from '../../modules/shared/domain/errors.js';
import { Money } from '../../modules/shared/domain/money.js';
import type {
  FailureCode,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './types.js';

export interface CreateWagerProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt: Date;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
  ) {}

  static create(props: CreateWagerProps): WagerTransaction {
    if (
      ['REFUND', 'ROLLBACK'].includes(props.kind) &&
      !props.referenceExternalTransactionId
    ) {
      throw new InvalidRequestError(
        `${props.kind} exige referenceExternalTransactionId`,
      );
    }

    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      props.createdAt,
      'PENDING',
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }
  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }
  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }
  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  isTerminal(): boolean {
    return ['PROCESSED', 'REJECTED', 'FAILED'].includes(this._status);
  }

  affectsBalance(): boolean {
    return this.kind !== 'LOSS';
  }

  requiresReference(): boolean {
    return ['REFUND', 'ROLLBACK'].includes(this.kind);
  }

  matchesPayload(hash: string): boolean {
    return this.payloadHash === hash;
  }

  markProcessed(at: Date, referenceId?: string): void {
    this.assertNotTerminal();
    this._status = 'PROCESSED';
    this._processedAt = at;
    if (referenceId) this._referenceTransactionId = referenceId;
  }

  markPendingReference(): void {
    this.assertNotTerminal();
    this._status = 'PENDING_REFERENCE';
  }

  reject(code: FailureCode): void {
    this.assertNotTerminal();
    this._status = 'REJECTED';
    this._failureCode = code;
  }

  fail(code: FailureCode): void {
    this.assertNotTerminal();
    this._status = 'FAILED';
    this._failureCode = code;
  }

  private assertNotTerminal(): void {
    if (this.isTerminal()) {
      throw new Error(
        `Transação ${this.id} já está em estado terminal: ${this._status}`,
      );
    }
  }
}
