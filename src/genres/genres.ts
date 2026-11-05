// Lista cerrada de generos (decision 23): con texto libre, «Salsa» y
// «salsa» saldrian como dos generos en la distribucion del tablero. En la
// base se guarda el codigo; la etiqueta es lo que ve el personal.
export const GENRES = {
  SALSA: 'Salsa',
  REGGAETON: 'Reguetón',
  VALLENATO: 'Vallenato',
  MERENGUE: 'Merengue',
  BACHATA: 'Bachata',
  CUMBIA: 'Cumbia y tropical',
  POPULAR: 'Música popular',
  POP: 'Pop',
  ROCK: 'Rock',
  ELECTRONIC: 'Electrónica',
  HIP_HOP: 'Hip hop y rap',
  BALLAD: 'Baladas',
  OTHER: 'Otro',
} as const;

export type Genre = keyof typeof GENRES;

export const GENRE_CODES = Object.keys(GENRES) as Genre[];
