import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/postgresql';
import { Money } from '../../shared/domain/money.js';

export interface ReconciliationResult {
  walletId: string;
  storedBalance: { amount: string; currency: string };
  calculatedBalance: { amount: string; currency: string };
  difference: { amount: string; currency: string };
  consistent: boolean;
  checkedEntries: number;
}

@Injectable()
export class ReconcileWalletUseCase {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  async execute(walletId: string): Promise<ReconciliationResult> {
    const em = this.orm.em.fork();

    const walletRow = await em.execute(
      `SELECT balance, currency FROM wallets WHERE id = ?`,
      [walletId],
    );

    if (walletRow.length === 0) {
      throw new NotFoundException('Wallet não encontrada');
    }

    const currency = walletRow[0].currency;
    const storedBalance = Money.from({
      amount: walletRow[0].balance,
      currency,
    });

    const ledgerStats = await em.execute(
      `SELECT
         COUNT(*) as total_entries,
         COALESCE(SUM(
           CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END
         ), 0) as calculated_sum
       FROM wallet_ledger_entries
       WHERE wallet_id = ?`,
      [walletId],
    );

    const checkedEntries = Number(ledgerStats[0].total_entries);

    const rawSum = Number(ledgerStats[0].calculated_sum).toFixed(2);
    const calculatedBalance = Money.from({ amount: rawSum, currency });

    const difference = calculatedBalance.subtract(storedBalance);
    const consistent = difference.isZero();

    return {
      walletId,
      storedBalance: storedBalance.toJSON(),
      calculatedBalance: calculatedBalance.toJSON(),
      difference: difference.toJSON(),
      consistent,
      checkedEntries,
    };
  }
}
