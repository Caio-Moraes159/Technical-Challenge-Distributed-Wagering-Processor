import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migration20261109000001 } from './migrations/Migration20261109000001_initial.js';

export function buildOrmConfig(clientUrl = process.env.DATABASE_URL) {
  return defineConfig({
    clientUrl:
      clientUrl ??
      'postgres://jungle:jungle_password@localhost:5432/wagering_db',
    entities: [],
    discovery: { warnWhenNoEntities: false },
    extensions: [Migrator],
    pool: { min: 2, max: 20 },
    migrations: {
      migrationsList: [
        {
          name: 'Migration20261109000001',
          class: Migration20261109000001,
        },
      ],
    },
  });
}
