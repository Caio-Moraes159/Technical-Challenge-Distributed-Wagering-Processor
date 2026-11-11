import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CreateWalletUseCase } from '../application/create-wallet.use-case.js';
import { WalletQueries } from '../application/wallet-queries.js';
import { ReconcileWalletUseCase } from '../application/reconcile-wallet.use-case.js';
import type { Wallet } from '../domain/wallet.js';

const toWalletResponse = (w: Wallet) => ({
  id: w.id,
  playerId: w.playerId,
  balance: w.balance.toJSON(),
  version: w.version,
});

@Controller('wallets')
export class WalletsController {
  constructor(
    @Inject(CreateWalletUseCase)
    private readonly createWallet: CreateWalletUseCase,
    @Inject(WalletQueries) private readonly queries: WalletQueries,
    @Inject(ReconcileWalletUseCase)
    private readonly reconcileWallet: ReconcileWalletUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: { playerId?: unknown; initialBalance?: unknown } | undefined,
  ) {
    const wallet = await this.createWallet.execute({
      playerId: body?.playerId,
      initialBalance: body?.initialBalance,
    });
    return toWalletResponse(wallet);
  }

  @Get(':walletId')
  async get(@Param('walletId') walletId: string) {
    return toWalletResponse(await this.queries.getWallet(walletId));
  }

  @Get(':walletId/ledger')
  async ledger(
    @Param('walletId') walletId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const page = await this.queries.listLedger(walletId, limit, cursor);
    return {
      items: page.items.map((e) => ({
        id: e.id,
        transactionId: e.transactionId,
        direction: e.direction,
        money: e.money.toJSON(),
        balanceBefore: e.balanceBefore.toJSON(),
        balanceAfter: e.balanceAfter.toJSON(),
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor ?? null,
    };
  }

  @Post(':walletId/reconciliation')
  @HttpCode(200)
  async reconcile(@Param('walletId') walletId: string) {
    return this.reconcileWallet.execute(walletId);
  }
}
