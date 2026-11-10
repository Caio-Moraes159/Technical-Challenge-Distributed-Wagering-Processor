import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { WalletsModule } from './modules/wallets/wallets.module.js';
import { WageringModule } from './wagering/wagering.module.js';
import { OutboxModule } from './modules/outbox/outbox.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    WalletsModule,
    WageringModule,
    OutboxModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
