import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';
import { AppModule } from '../../app.module';
import { NightSimulator } from './night-simulator';

const DEFAULTS = { venue: 'taberna-el-faro', nights: '8', seed: '1' };

// npm run simulate -- [--venue <slug>] [--nights <n>] [--seed <n>]
// Genera noches pasadas para la analitica (BE-24). Lee la conexion del .env.
async function main(): Promise<void> {
  // Escribe datos inventados en la base: nunca en produccion.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The simulate command must not run in production');
  }
  const { values } = parseArgs({
    options: {
      venue: { type: 'string', default: DEFAULTS.venue },
      nights: { type: 'string', default: DEFAULTS.nights },
      seed: { type: 'string', default: DEFAULTS.seed },
    },
  });
  const nights = Number(values.nights);
  const seed = Number(values.seed);
  if (!Number.isInteger(nights) || nights < 1) {
    throw new Error('--nights must be a positive integer');
  }
  if (!Number.isInteger(seed)) {
    throw new Error('--seed must be an integer');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const reports = await new NightSimulator(app).run({
      venueSlug: values.venue,
      nights,
      seed,
    });
    console.table(reports);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
