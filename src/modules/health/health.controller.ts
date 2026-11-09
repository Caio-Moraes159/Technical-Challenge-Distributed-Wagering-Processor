import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/postgresql';

@Controller('health')
export class HealthController {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  /** Liveness: o processo responde. Nunca toca em dependências. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependências alcançáveis. (SQS entra no Dia 2.) */
  @Get('ready')
  async ready() {
    try {
      await this.orm.em.fork().execute('select 1');
      return { status: 'ok', checks: { postgres: 'up' } };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', checks: { postgres: 'down' } });
    }
  }
}
