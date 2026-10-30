import { config } from 'dotenv';
import { resolve } from 'path';
import { Client } from 'pg';

// Se ejecuta una vez antes de toda la suite e2e: recrea la base de datos de
// pruebas desde cero y aplica las migraciones, para que cada corrida sea
// determinista sin importar el estado dejado por corridas anteriores.
export default async function globalSetup(): Promise<void> {
  config({ path: resolve(__dirname, '../.env.test'), quiet: true });

  const dbName = process.env.DATABASE_NAME!;
  const adminClient = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: 'postgres',
  });
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await adminClient.query(`CREATE DATABASE "${dbName}"`);
  await adminClient.end();

  // require (no import): Jest ejecuta globalSetup fuera de su sandbox de modulos,
  // asi que un import() dinamico usaria el resolvedor ESM nativo de Node e ignoraria
  // los .ts fuente. ts-node/register habilita que require() si pueda cargarlos.
  // transpileOnly evita que ts-node fuerce el chequeo de tipos completo (incluida
  // la emision de .d.ts) sobre todo el grafo de entidades, que aqui es innecesario.
  require('ts-node').register({ transpileOnly: true });
  require('tsconfig-paths/register');
  // Para este punto ya esta seteado process.env.DATABASE_NAME: el dotenv.config()
  // interno de data-source.ts no sobreescribe env vars ya existentes.
  const { AppDataSource } = require('../src/database/data-source');
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();
}
