import { Module } from '@nestjs/common';
import { CreateWalletUseCase } from './application/create-wallet.use-case.js';
import { WalletQueries } from './application/wallet-queries.js';
import { WalletsController } from './http/wallets.controller.js';

@Module({
  controllers: [WalletsController],
  providers: [CreateWalletUseCase, WalletQueries],
})
export class WalletsModule {}
