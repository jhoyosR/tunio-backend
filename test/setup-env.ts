import { config } from 'dotenv';
import { resolve } from 'path';

// Carga .env.test antes de que arranque cada archivo de test e2e (ConfigModule
// de Nest no sobreescribe variables ya presentes en process.env).
config({ path: resolve(__dirname, '../.env.test'), quiet: true });
