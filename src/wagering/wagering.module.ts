import { Module } from '@nestjs/common';
import { WageringController } from './http/wagering.controller.js';
import { ProcessWagerUseCase } from './application/process-wager.use-case.js';
import { SqsConsumerService } from './application/sqs-consumer.service.js';
import { WalletsModule } from '../modules/wallets/wallets.module.js';

@Module({
  imports: [WalletsModule],
  controllers: [WageringController],
  providers: [ProcessWagerUseCase, SqsConsumerService],
})
export class WageringModule {}
