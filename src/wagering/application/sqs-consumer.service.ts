import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { MikroORM, type SqlEntityManager } from '@mikro-orm/postgresql';
import { ProcessWagerUseCase } from './process-wager.use-case.js';
import { InboxMessage } from '../domain/inbox-message.js';
import { InboxRepository } from '../infrastructure/wagering.repositories.js';

@Injectable()
export class SqsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerService.name);
  private readonly sqs: SQSClient;
  private isRunning = false;
  private readonly queueUrl =
    'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/wager-transactions.fifo';
  private readonly consumerName = 'wager-processor-group';

  constructor(
    @Inject(ProcessWagerUseCase)
    private readonly processWager: ProcessWagerUseCase,
    @Inject(MikroORM) private readonly orm: MikroORM,
  ) {
    this.sqs = new SQSClient({
      endpoint: 'http://localhost:4566',
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
  }

  onModuleInit() {
    this.isRunning = true;
    this.logger.log('Iniciando consumo da fila SQS...');
    this.poll();
  }

  onModuleDestroy() {
    this.isRunning = false;
    this.logger.log('Parando o consumo SQS (Graceful Shutdown)...');
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const { Messages } = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20,
          }),
        );

        if (!Messages) continue;

        for (const message of Messages) {
          await this.processMessage(message);
        }
      } catch (error) {
        this.logger.error('Erro ao consumir fila SQS', error);
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
  }

  private async processMessage(message: any) {
    const msgId = message.MessageId!;

    try {
      const body = JSON.parse(message.Body!);
      const data = body.data;

      await this.orm.em.transactional(async (tx) => {
        const em = tx as SqlEntityManager;
        const inboxRepo = new InboxRepository(em);

        let inboxMsg = await inboxRepo.find(msgId, this.consumerName);

        if (inboxMsg && inboxMsg.isProcessed()) {
          this.logger.debug(
            `Mensagem ${msgId} já processada (Idempotência SQS). Ignorando.`,
          );
          return;
        }

        if (!inboxMsg) {
          inboxMsg = InboxMessage.receive(
            msgId,
            this.consumerName,
            'hash-do-payload',
          );
        }

        await this.processWager.execute({
          idempotencyKey: data.idempotencyKey,
          providerId: data.providerId,
          externalTransactionId: data.externalTransactionId,
          walletId: data.walletId,
          playerId: data.playerId,
          roundId: data.roundId,
          gameId: data.gameId,
          kind: data.kind,
          amount: data.money?.amount,
          currency: data.money?.currency,
          referenceExternalTransactionId: data.referenceExternalTransactionId,
        });

        inboxMsg.markProcessed(new Date());
        await inboxRepo.insert(inboxMsg);
      });

      await this.ack(message.ReceiptHandle!);
      this.logger.log(`Mensagem SQS ${msgId} processada com sucesso!`);
    } catch (error: any) {
      this.logger.error(
        `Falha ao processar mensagem SQS ${msgId}: ${error.message}`,
      );
    }
  }

  private async ack(receiptHandle: string) {
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
