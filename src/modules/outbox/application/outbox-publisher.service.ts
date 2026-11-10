import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MikroORM, type SqlEntityManager } from '@mikro-orm/postgresql';

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);

  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  @Cron(CronExpression.EVERY_SECOND)
  async publishPendingMessages() {
    await this.orm.em.transactional(async (tx) => {
      const em = tx as SqlEntityManager;

      const rows = await em.execute<any[]>(
        `SELECT id, payload, attempts
         FROM outbox_messages
         WHERE published_at IS NULL
           AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
         ORDER BY occurred_at ASC
         LIMIT 50
         FOR UPDATE SKIP LOCKED`,
      );

      if (rows.length === 0) return;

      for (const row of rows) {
        try {
          this.logger.log(`Evento emitido com sucesso: ${row.id}`);

          await em.execute(
            `UPDATE outbox_messages SET published_at = NOW() WHERE id = ?`,
            [row.id],
          );
        } catch (error) {
          this.logger.error(`Falha ao publicar evento ${row.id}`, error);

          const attempts = row.attempts + 1;
          const delaySeconds = Math.pow(2, attempts);

          await em.execute(
            `UPDATE outbox_messages
             SET attempts = ?, next_attempt_at = NOW() + INTERVAL '${delaySeconds} seconds'
             WHERE id = ?`,
            [attempts, row.id],
          );
        }
      }
    });
  }
}
