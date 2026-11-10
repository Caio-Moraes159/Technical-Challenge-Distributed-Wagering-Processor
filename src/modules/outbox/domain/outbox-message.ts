import { randomUUID } from 'node:crypto';
import type { IntegrationEvent } from '../../../wagering/domain/types.js';

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue(event: IntegrationEvent<unknown>): OutboxMessage {
    return new OutboxMessage(
      randomUUID(),
      event.aggregateId,
      event.eventType,
      event.toJSON(),
      event.occurredAt,
      0,
    );
  }

  get attempts(): number {
    return this._attempts;
  }
  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }
  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  markPublished(at: Date): void {
    this._publishedAt = at;
  }

  scheduleRetry(now: Date): void {
    this._attempts += 1;
    const delayMs = Math.pow(2, this._attempts) * 1000;
    this._nextAttemptAt = new Date(now.getTime() + delayMs);
  }
}
