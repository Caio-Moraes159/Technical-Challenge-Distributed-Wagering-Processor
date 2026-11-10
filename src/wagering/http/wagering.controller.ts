import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  BadRequestException,
} from '@nestjs/common';
import {
  ProcessWagerUseCase,
  type ProcessWagerInput,
} from '../application/process-wager.use-case.js';
import { WalletQueries } from '../../modules/wallets/application/wallet-queries.js';

@Controller('wagering')
export class WageringController {
  constructor(
    @Inject(ProcessWagerUseCase)
    private readonly processWager: ProcessWagerUseCase,
    @Inject(WalletQueries) private readonly walletQueries: WalletQueries,
  ) {}

  @Post('transactions')
  @HttpCode(200)
  async process(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: any,
  ) {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const input: ProcessWagerInput = {
      idempotencyKey,
      providerId: body.providerId,
      externalTransactionId: body.externalTransactionId,
      walletId: body.walletId,
      playerId: body.playerId,
      roundId: body.roundId,
      gameId: body.gameId,
      kind: body.kind,
      amount: body.money?.amount,
      currency: body.money?.currency,
      referenceExternalTransactionId: body.referenceExternalTransactionId,
    };

    const result = await this.processWager.execute(input);

    const wallet = await this.walletQueries.getWallet(result.tx.walletId);

    return {
      transactionId: result.tx.id,
      status: result.tx.status,
      failureCode: result.tx.failureCode,
      balance: wallet.balance.toJSON(),
      idempotentReplay: result.idempotentReplay,
    };
  }
}
