import { Module } from '@nestjs/common';
import { OutboxPublisherService } from './application/outbox-publisher.service.js';

@Module({
  providers: [OutboxPublisherService],
})
export class OutboxModule {}
