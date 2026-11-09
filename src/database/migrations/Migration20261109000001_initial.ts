import { Migration } from '@mikro-orm/migrations';

export class Migration20261109000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table wallets (
        id          uuid primary key,
        player_id   text not null,
        currency    char(3) not null,
        balance     numeric(19,2) not null,
        version     integer not null default 1,
        created_at  timestamptz not null,
        updated_at  timestamptz not null,
        constraint wallets_balance_non_negative check (balance >= 0),
        constraint wallets_version_positive check (version >= 1),
        constraint wallets_player_currency_uq unique (player_id, currency)
      )`);

    this.addSql(`
      create table wager_transactions (
        id                                uuid primary key,
        provider_id                       text not null,
        external_transaction_id           text not null,
        idempotency_key                   text not null,
        payload_hash                      text not null,
        wallet_id                         uuid not null references wallets(id),
        player_id                         text not null,
        round_id                          text not null,
        game_id                           text not null,
        kind                              text not null,
        amount                            numeric(19,2) not null,
        currency                          char(3) not null,
        reference_external_transaction_id text,
        reference_transaction_id          uuid references wager_transactions(id),
        status                            text not null,
        failure_code                      text,
        balance_after                     numeric(19,2),
        created_at                        timestamptz not null,
        processed_at                      timestamptz,
        constraint wager_tx_kind_ck check (kind in ('OPENING','BET','WIN','LOSS','REFUND','ROLLBACK')),
        constraint wager_tx_status_ck check (status in ('PENDING','PENDING_REFERENCE','PROCESSED','REJECTED','FAILED')),
        constraint wager_tx_amount_ck check (amount >= 0),
        constraint wager_tx_idempotency_uq unique (idempotency_key),
        constraint wager_tx_external_uq unique (provider_id, external_transaction_id),
        constraint wager_tx_reference_required_ck
          check ((kind in ('REFUND','ROLLBACK')) = (reference_external_transaction_id is not null)),
        constraint wager_tx_failure_code_ck check (status not in ('REJECTED','FAILED') or failure_code is not null),
        constraint wager_tx_processed_at_ck check (status <> 'PROCESSED' or processed_at is not null)
      )`);

    this.addSql(`
      create unique index wager_tx_single_reversal_uq
        on wager_transactions (reference_transaction_id)
        where status = 'PROCESSED' and kind in ('REFUND','ROLLBACK')`);

    this.addSql(`
      create index wager_tx_pending_reference_idx
        on wager_transactions (created_at) where status = 'PENDING_REFERENCE'`);

    this.addSql(`
      create table wallet_ledger_entries (
        id             uuid primary key,
        seq            bigint generated always as identity,
        wallet_id      uuid not null references wallets(id),
        transaction_id uuid not null references wager_transactions(id),
        direction      text not null,
        amount         numeric(19,2) not null,
        currency       char(3) not null,
        balance_before numeric(19,2) not null,
        balance_after  numeric(19,2) not null,
        created_at     timestamptz not null,
        constraint ledger_direction_ck check (direction in ('DEBIT','CREDIT')),
        constraint ledger_amount_positive_ck check (amount > 0),
        constraint ledger_balances_non_negative_ck check (balance_before >= 0 and balance_after >= 0),
        constraint ledger_balanced_ck check (
          (direction = 'CREDIT' and balance_after = balance_before + amount) or
          (direction = 'DEBIT'  and balance_after = balance_before - amount)
        ),
        constraint ledger_wallet_tx_uq unique (wallet_id, transaction_id)
      )`);
    this.addSql(
      `create index ledger_wallet_seq_idx on wallet_ledger_entries (wallet_id, seq desc)`,
    );

    this.addSql(`
      create function forbid_ledger_mutation() returns trigger language plpgsql as $$
      begin
        raise exception 'wallet_ledger_entries is append-only (% not allowed)', tg_op;
      end $$`);
    this.addSql(`
      create trigger wallet_ledger_entries_immutable
        before update or delete on wallet_ledger_entries
        for each row execute function forbid_ledger_mutation()`);

    this.addSql(`
      create table inbox_messages (
        consumer_name text not null,
        message_id    text not null,
        payload_hash  text not null,
        received_at   timestamptz not null,
        processed_at  timestamptz,
        primary key (consumer_name, message_id)
      )`);

    this.addSql(`
      create table outbox_messages (
        id              uuid primary key,
        aggregate_id    text not null,
        event_type      text not null,
        payload         jsonb not null,
        occurred_at     timestamptz not null,
        attempts        integer not null default 0,
        next_attempt_at timestamptz,
        published_at    timestamptz
      )`);
    this.addSql(`
      create index outbox_pending_idx on outbox_messages (occurred_at) where published_at is null`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists outbox_messages`);
    this.addSql(`drop table if exists inbox_messages`);
    this.addSql(
      `drop trigger if exists wallet_ledger_entries_immutable on wallet_ledger_entries`,
    );
    this.addSql(`drop table if exists wallet_ledger_entries`);
    this.addSql(`drop function if exists forbid_ledger_mutation()`);
    this.addSql(`drop table if exists wager_transactions`);
    this.addSql(`drop table if exists wallets`);
  }
}
