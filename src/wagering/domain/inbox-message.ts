import { InvalidRequestError } from '../../modules/shared/domain/errors.js';

export class InboxMessage {
  private constructor(
    public readonly messageId: string,
    public readonly consumerName: string,
    public readonly payloadHash: string,
    public readonly receivedAt: Date,
    private _processedAt?: Date,
  ) {}

  static receive(
    messageId: string,
    consumerName: string,
    payloadHash: string,
  ): InboxMessage {
    if (!messageId || !consumerName) {
      throw new InvalidRequestError(
        'messageId e consumerName são obrigatórios no Inbox',
      );
    }
    return new InboxMessage(messageId, consumerName, payloadHash, new Date());
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  isProcessed(): boolean {
    return this._processedAt !== undefined;
  }

  markProcessed(at: Date): void {
    this._processedAt = at;
  }
}
