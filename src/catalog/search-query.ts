export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 100;

// Clave de la cache: minusculas, sin tildes y con los espacios colapsados.
// Asi "Canción  Bonita" y "cancion bonita" comparten resultados y solo la
// primera gasta cuota.
export function normalizeQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
