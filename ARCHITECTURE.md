# Arquitetura e Decisões Técnicas

## 1. Concorrência e Isolamento

Para resolver o problema de múltiplas instâncias disputando o mesmo saldo simultaneamente, usei o **Pessimistic Locking (`SELECT FOR UPDATE`)** ancorado no Aggregate Root (`Wallet`).

- **Por que não Optimistic Locking?** Sistemas de apostas sofrem de altíssima contenção no mesmo registro (hot wallets). O Optimistic Locking geraria um excesso de retries e sobrecarga transacional sob carga pesada. O Pessimistic Lock forma uma fila linear no PostgreSQL, resolvendo a disputa na base de dados.

## 2. Padrões Outbox e Inbox - Mensageria

- **Transactional Outbox:** O evento de `WagerTransactionProcessed` é gravado na tabela `outbox_messages` dentro da mesma transação SQL da aposta. Se o commit falhar, o evento não é publicado. Um worker lê esta tabela utilizando o `FOR UPDATE SKIP LOCKED`, o que permite múltiplas réplicas da aplicação,publicarem mensagens paralelamente.
- **Inbox Pattern:** Para mitigar as garantias _at-least-once_ do SQS, toda mensagem consumida é registrada numa tabela de `inbox_messages`. O processamento é abortado silenciosamente se o `message_id` já constar como processado. O `ack` (deleção da fila SQS) ocorre estritamente após o commit da transação.

## 3. Idempotência e Anti-Fraude

Não utilizo cache em memória, pois violaria as garantias de durabilidade.

- A exigência de unicidade é feita através do header `Idempotency-Key` persistido na própria transação.
- **Proteção de Payload:** Armazenamos o hash do conteúdo da requisição (`payloadHash`). Se o provedor reenviar a mesma chave de idempotência com valores de aposta divergentes, o sistema rejeita a operação com `PAYLOAD_CONFLICT`.

## 4. Escolha do ORM: MikroORM

Escolhi o MikroORM por ter rigorosamente aos padrões **Unit of Work** e **Identity Map**. Diferente do Prisma ou TypeORM, ele permite:

1. Controle transacional explícito sem perda de contexto (`em.transactional`).
2. Aplicação direta e nativa de bloqueios no banco de dados (`LockMode.PESSIMISTIC_WRITE`).
3. Separação limpa entre Entidades de Domínio e o ciclo de persistência, respeitando o modelo DDD puro.

## 5. O Tipo Monetário (Money Value Object)

Em atendimento estrito às regras financeiras, floats ou numbers nativos jamais são utilizados.

- Criou-se o Value Object `Money`, que valida strings e encapsula toda a lógica de negócio (soma, subtração, limites). No banco, os valores monetários são tipados nativamente pelo PostgreSQL (`numeric(12, 2)`), garantindo precisão absoluta.
