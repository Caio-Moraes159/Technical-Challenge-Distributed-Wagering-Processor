import { MikroORM } from '@mikro-orm/postgresql';
import { buildOrmConfig } from './mikro-orm.config.js';

const direction = process.argv[2];
if (direction !== 'up' && direction !== 'down') {
  console.error('usage: migrate.ts up|down');
  process.exit(1);
}

const orm = await MikroORM.init(buildOrmConfig());
const migrator = orm.migrator;
const done = direction === 'up' ? await migrator.up() : await migrator.down();
console.log(
  `${direction}: ${done.map((m) => m.name).join(', ') || 'nothing to do'}`,
);
await orm.close();
