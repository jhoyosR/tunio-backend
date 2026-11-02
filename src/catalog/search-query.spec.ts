import { normalizeQuery } from './search-query';

describe('normalizeQuery', () => {
  it('pasa a minusculas, quita tildes y colapsa espacios', () => {
    expect(normalizeQuery('  Canción   BONITA\t de  Pingüino ')).toBe(
      'cancion bonita de pinguino',
    );
  });

  it('dos escrituras de la misma busqueda comparten clave de cache', () => {
    expect(normalizeQuery('Ñandú')).toBe(normalizeQuery('nandu'));
  });

  it('es idempotente', () => {
    const once = normalizeQuery(' Él  Vino ');
    expect(normalizeQuery(once)).toBe(once);
  });
});
