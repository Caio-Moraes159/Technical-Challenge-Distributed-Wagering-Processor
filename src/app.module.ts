import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { WalletsModule } from './modules/wallets/wallets.module.js';

@Module({
  imports: [DatabaseModule, WalletsModule],
  controllers: [HealthController],
})
export class AppModule {}
