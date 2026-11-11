import { Module } from '@nestjs/common';
import { CreateWalletUseCase } from './application/create-wallet.use-case.js';
import { WalletQueries } from './application/wallet-queries.js';
import { ReconcileWalletUseCase } from './application/reconcile-wallet.use-case.js';
import { WalletsController } from './http/wallets.controller.js';

@Module({
  controllers: [WalletsController],
  providers: [CreateWalletUseCase, WalletQueries, ReconcileWalletUseCase],
  exports: [WalletQueries],
})
export class WalletsModule {}
