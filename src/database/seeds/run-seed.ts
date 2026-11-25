import { AppDataSource } from '../data-source';
import { seedDatabase } from './seed';

// npm run seed. Lee la conexion y SEED_STAFF_PASSWORD del .env.
async function main(): Promise<void> {
  // Crea credenciales con una contrasena compartida: nunca en produccion.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The seed command must not run in production');
  }
  const password = process.env.SEED_STAFF_PASSWORD;
  if (!password) {
    throw new Error('SEED_STAFF_PASSWORD is not set');
  }

  await AppDataSource.initialize();
  try {
    const venues = await seedDatabase(AppDataSource, password);
    // El token del QR no es secreto: es lo que va impreso en el local.
    for (const venue of venues) {
      console.log(`\n${venue.name}`);
      console.log(`  QR token: ${venue.qrToken}`);
      console.log(`  Personal: ${venue.staffEmails.join(', ')}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
