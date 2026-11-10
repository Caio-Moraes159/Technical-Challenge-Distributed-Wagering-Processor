export type WagerTransactionKind =
  'OPENING' | 'BET' | 'WIN' | 'LOSS' | 'REFUND' | 'ROLLBACK';
export type WagerTransactionStatus =
  'PENDING' | 'PENDING_REFERENCE' | 'PROCESSED' | 'REJECTED' | 'FAILED';

export type FailureCode =
  | 'BET_INSUFFICIENT_FUNDS'
  | 'REFERENCE_NOT_FOUND'
  | 'REFERENCE_ALREADY_REVERSED'
  | 'REFERENCE_STATUS_INVALID'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'PAYLOAD_CONFLICT'
  | 'NEGATIVE_BALANCE_PREVENTED';

export abstract class IntegrationEvent<T> {
  abstract readonly eventType: string;
  abstract readonly version: number;

  constructor(
    public readonly eventId: string,
    public readonly aggregateId: string,
    public readonly correlationId: string,
    public readonly occurredAt: Date,
    public readonly data: Readonly<T>,
    public readonly causationId?: string,
  ) {}

  toJSON() {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      occurredAt: this.occurredAt.toISOString(),
      version: this.version,
      data: this.data,
    };
  }
}
