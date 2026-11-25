import { createHash, randomBytes } from 'crypto';
import { hashInstallationId } from './device-hash';

const INSTALLATION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('hashInstallationId', () => {
  const salt = randomBytes(32);

  it('es SHA-256 del UUID seguido de la sal, en hex de 64 caracteres', () => {
    const expected = createHash('sha256')
      .update(Buffer.concat([Buffer.from(INSTALLATION_ID, 'utf8'), salt]))
      .digest('hex');

    const hash = hashInstallationId(INSTALLATION_ID, salt);

    expect(hash).toBe(expected);
    // Mismo formato que exige el CHECK de anonymous_devices.device_hash.
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el mismo telefono da el mismo hash en el mismo local', () => {
    expect(hashInstallationId(INSTALLATION_ID.toUpperCase(), salt)).toBe(
      hashInstallationId(INSTALLATION_ID, salt),
    );
  });

  it('el mismo telefono da hashes distintos en locales distintos', () => {
    expect(hashInstallationId(INSTALLATION_ID, randomBytes(32))).not.toBe(
      hashInstallationId(INSTALLATION_ID, salt),
    );
  });

  it('el hash no contiene el UUID en claro', () => {
    const hash = hashInstallationId(INSTALLATION_ID, salt);
    expect(hash).not.toContain(INSTALLATION_ID.replace(/-/g, ''));
  });
});
