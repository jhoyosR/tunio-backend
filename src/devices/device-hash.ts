import { createHash } from 'crypto';

// device_hash = SHA-256( uuid_de_instalacion || sal_del_establecimiento ),
// tal como lo define docs/06. El UUID se pasa a minusculas porque su texto
// canonico no distingue mayusculas: el mismo telefono debe dar el mismo hash.
// La sal por local impide relacionar el mismo telefono entre bares.
export function hashInstallationId(
  installationId: string,
  venueSalt: Buffer,
): string {
  return createHash('sha256')
    .update(installationId.toLowerCase(), 'utf8')
    .update(venueSalt)
    .digest('hex');
}
