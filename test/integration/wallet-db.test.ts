import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { Migrator } from '@mikro-orm/migrations';
import { MikroORM, type SqlEntityManager } from '@mikro-orm/postgresql';
import { buildOrmConfig } from '../../src/database/mikro-orm.config.js';
import { InsufficientFundsError } from '../../src/modules/shared/domain/errors.js';
import { Money } from '../../src/modules/shared/domain/money.js';
import { LedgerDirection } from '../../src/modules/wallets/domain/ledger-entry.js';
import { CreateWalletUseCase } from '../../src/modules/wallets/application/create-wallet.use-case.js';
import { WalletQueries } from '../../src/modules/wallets/application/wallet-queries.js';
import {
  LedgerRepository,
  TransactionRowRepository,
  WalletRepository,
} from '../../src/modules/wallets/infrastructure/repositories.js';

const url = process.env.DATABASE_URL;
const brl = (amount: string) => ({ amount, currency: 'BRL' });

describe.skipIf(!url)('integração: PostgreSQL real', () => {
  let orm: MikroORM;
  let create: CreateWalletUseCase;
  let queries: WalletQueries;

  beforeAll(async () => {
    orm = await MikroORM.init(buildOrmConfig(url));
    await orm.migrator.up();
    create = new CreateWalletUseCase(orm);
    queries = new WalletQueries(orm);
  });
  afterAll(async () => {
    await orm.close();
  });

  const newWallet = (initial = '100.00') =>
    create.execute({
      playerId: `p-${randomUUID()}`,
      initialBalance: brl(initial),
    });

  async function bet(
    walletId: string,
    amount: string,
  ): Promise<'PROCESSED' | 'REJECTED'> {
    return orm.em.fork().transactional(async (tx) => {
      const em = tx as SqlEntityManager;
      const wallets = new WalletRepository(em);
      const txs = new TransactionRowRepository(em);
      const wallet = await wallets.lockById(walletId);
      if (!wallet) throw new Error('wallet not found');
      const id = randomUUID();
      const ext = randomUUID();
      const base = {
        id,
        providerId: 'test',
        externalTransactionId: ext,
        idempotencyKey: `test:${ext}`,
        payloadHash: createHash('sha256').update(ext).digest('hex'),
        walletId,
        playerId: wallet.playerId,
        roundId: 'r1',
        gameId: 'g1',
        kind: 'BET',
        money: Money.from(brl(amount)),
        createdAt: new Date(),
      };
      try {
        const entry = wallet.debit(Money.from(brl(amount)), id);
        await txs.insert({
          ...base,
          status: 'PROCESSED',
          balanceAfter: wallet.balance,
          processedAt: new Date(),
        });
        await new LedgerRepository(em).insert(entry);
        await wallets.save(wallet);
        return 'PROCESSED';
      } catch (e) {
        if (!(e instanceof InsufficientFundsError)) throw e;
        await txs.insert({
          ...base,
          status: 'REJECTED',
          failureCode: 'BET_INSUFFICIENT_FUNDS',
        });
        return 'REJECTED';
      }
    });
  }

  it('cria wallet com OPENING + lançamento CREDIT na mesma transação', async () => {
    const w = await newWallet('1000.00');
    expect(w.version).toBe(1);
    const page = await queries.listLedger(w.id);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.direction).toBe(LedgerDirection.Credit);
    expect(page.items[0]!.balanceAfter.amount).toBe('1000.00');
    expect(page.items[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('wallet duplicada (mesmo player + moeda) falha como conflito', async () => {
    const playerId = `p-${randomUUID()}`;
    await create.execute({ playerId, initialBalance: brl('10.00') });
    await expect(
      create.execute({ playerId, initialBalance: brl('5.00') }),
    ).rejects.toMatchObject({
      code: 'WALLET_ALREADY_EXISTS',
    });
  });

  it('CENÁRIO OBRIGATÓRIO: saldo 100, duas apostas de 80 em paralelo', async () => {
    const w = await newWallet('100.00');
    const results = await Promise.all([bet(w.id, '80.00'), bet(w.id, '80.00')]);

    expect([...results].sort()).toEqual(['PROCESSED', 'REJECTED']);
    const after = await queries.getWallet(w.id);
    expect(after.balance.amount).toBe('20.00');
    expect(after.version).toBe(2);

    const ledger = await queries.listLedger(w.id);
    expect(
      ledger.items.filter((e) => e.direction === LedgerDirection.Debit),
    ).toHaveLength(1);
  });

  it('stress: 20 apostas de 10 contra saldo 100 -> exatamente 10 passam, saldo 0', async () => {
    const w = await newWallet('100.00');
    const results = await Promise.all(
      Array.from({ length: 20 }, () => bet(w.id, '10.00')),
    );
    expect(results.filter((r) => r === 'PROCESSED')).toHaveLength(10);
    expect((await queries.getWallet(w.id)).balance.amount).toBe('0.00');
  });

  it('INVARIANTE: wallet.balance == saldo reconstruído pelo ledger', async () => {
    const w = await newWallet('100.00');
    await Promise.all([
      bet(w.id, '30.00'),
      bet(w.id, '30.00'),
      bet(w.id, '50.00'),
    ]);
    const stored = (await queries.getWallet(w.id)).balance;
    const rebuilt = await new LedgerRepository(
      orm.em.fork() as SqlEntityManager,
    ).sumBalance(w.id, 'BRL');
    expect(stored.equals(rebuilt)).toBe(true);
  });

  it('paginação por cursor percorre tudo sem repetir', async () => {
    const w = await newWallet('100.00');
    for (let i = 0; i < 4; i++) await bet(w.id, '10.00');
    const p1 = await queries.listLedger(w.id, '2');
    const p2 = await queries.listLedger(w.id, '2', p1.nextCursor);
    const p3 = await queries.listLedger(w.id, '2', p2.nextCursor);
    const ids = [...p1.items, ...p2.items, ...p3.items].map((e) => e.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeUndefined();
  });

  describe('garantias aplicadas pelo BANCO (não pelo código)', () => {
    it('ledger é imutável: UPDATE e DELETE são recusados', async () => {
      const w = await newWallet('10.00');
      const em = orm.em.fork();
      await expect(
        em.execute(
          'update wallet_ledger_entries set amount = 1 where wallet_id = ?',
          [w.id],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        em.execute('delete from wallet_ledger_entries where wallet_id = ?', [
          w.id,
        ]),
      ).rejects.toThrow(/append-only/);
    });

    it('saldo negativo é recusado pelo CHECK', async () => {
      const w = await newWallet('10.00');
      await expect(
        orm.em
          .fork()
          .execute('update wallets set balance = -1 where id = ?', [w.id]),
      ).rejects.toThrow(/wallets_balance_non_negative/);
    });

    it('REFUND/ROLLBACK sem referência é recusado pelo CHECK', async () => {
      const w = await newWallet('10.00');
      const em = orm.em.fork() as SqlEntityManager;
      await expect(
        new TransactionRowRepository(em).insert({
          id: randomUUID(),
          providerId: 'p',
          externalTransactionId: randomUUID(),
          idempotencyKey: randomUUID(),
          payloadHash: 'h',
          walletId: w.id,
          playerId: w.playerId,
          roundId: 'r',
          gameId: 'g',
          kind: 'REFUND',
          money: Money.from(brl('1.00')),
          status: 'PENDING',
          createdAt: new Date(),
        }),
      ).rejects.toThrow(/wager_tx_reference_required_ck/);
    });
  });
});
