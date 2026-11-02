import * as bcrypt from 'bcrypt';

// bcrypt deriva la clave con sal aleatoria incluida en el propio hash.
// Coste 12: ~250 ms por verificacion, aceptable para un login y caro para
// un ataque de diccionario sobre un hash filtrado.
const BCRYPT_COST = 12;

// Funciones sueltas (no un servicio) para que el comando de datos semilla
// pueda usarlas sin levantar la aplicacion de Nest.
export function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

export function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
