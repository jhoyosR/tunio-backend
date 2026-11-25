import { normalizeQuery } from './search-query';

// REGLA PARA DERIVAR TITULO Y ARTISTA (BE-11). YouTube no da el artista:
// solo el titulo del video y el nombre del canal. Es determinista: el mismo
// titulo y canal producen siempre el mismo resultado.
//
//   1. Se quitan del titulo los parentesis y corchetes "de relleno": los que
//      contienen alguna palabra de NOISE_WORDS. "(Official Video)" sale;
//      "(Esto es Africa)" se queda.
//   2. Se descarta todo lo que siga a una barra vertical: "| Discos Fuentes",
//      "|Letra|".
//   3. Se parte por el separador " - " (o raya). Los trozos finales que son
//      solo relleno ("Video Oficial") se descartan. Si quedan dos o mas, el
//      primero es el artista y el resto, el titulo.
//   4. Si lo unico que seguia al separador era relleno y lo que queda tiene
//      una coma, es el formato de las disqueras colombianas (Codiscos,
//      Discos Fuentes): "Cancion, Artista - Video Oficial".
//   5. Si no, el artista sale del canal sin "VEVO", " - Topic" ni
//      "Official"/"Oficial", y con las palabras pegadas separadas:
//      "SilvestreDangondVEVO" -> "Silvestre Dangond".
//
// Limites conocidos: el orden invertido ("CANCION - Artista") se lee al
// reves, y un titulo sin separador subido por un canal de fans toma al
// canal como artista. Para el catalogo semilla se escribieron a mano.

const NOISE_WORDS = new Set([
  'official',
  'oficial',
  'video',
  'videoclip',
  'audio',
  'lyric',
  'lyrics',
  'letra',
  'hd',
  '4k',
  'remaster',
  'remastered',
  'remasterizado',
  'visualizer',
  'mv',
]);

const BRACKETED = /\s*[([][^)\]]*[)\]]/g;
const SEPARATOR = /\s+[-–—]\s+/;
// "Cancion, Artista": parte por la PRIMERA coma, porque el artista puede
// llevar otras ("Olvidala, Binomio De Oro, Rafael Orozco").
const LABEL_FORMAT = /^([^,]+),(.+)$/;
const CHANNEL_SUFFIXES = /(vevo|\s*-\s*topic|\s*(official|oficial))$/i;
const GLUED_WORDS = /(\p{Ll})(\p{Lu})/gu;

export interface SongIdentity {
  title: string;
  artistDisplay: string | null;
}

export function deriveSongIdentity(
  rawTitle: string,
  channelTitle: string,
): SongIdentity {
  const cleaned = rawTitle
    .replace(BRACKETED, (group) => (hasNoiseWord(group) ? '' : group))
    .split('|')[0];

  const parts = cleaned.split(SEPARATOR).map(collapse).filter(Boolean);
  let droppedNoise = false;
  while (parts.length > 1 && isOnlyNoise(parts[parts.length - 1])) {
    parts.pop();
    droppedNoise = true;
  }

  if (parts.length > 1) {
    return { artistDisplay: parts[0], title: parts.slice(1).join(' - ') };
  }
  const labelFormat = droppedNoise ? LABEL_FORMAT.exec(parts[0]) : null;
  if (labelFormat) {
    return {
      title: labelFormat[1].trim(),
      artistDisplay: labelFormat[2].trim(),
    };
  }
  return {
    title: parts[0] || collapse(rawTitle),
    artistDisplay: artistFromChannel(channelTitle),
  };
}

// Entre parentesis basta una palabra de relleno: "(Cancion Oficial de la
// Copa Mundial)" sale entero.
function hasNoiseWord(text: string): boolean {
  return words(text).some((word) => NOISE_WORDS.has(word));
}

// Fuera de parentesis el trozo tiene que ser todo relleno: "Video Oficial"
// sale, pero "Oficial de Mi Pueblo" podria ser el nombre de la cancion.
function isOnlyNoise(text: string): boolean {
  const all = words(text);
  return all.length > 0 && all.every((word) => NOISE_WORDS.has(word));
}

function words(text: string): string[] {
  return normalizeQuery(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function artistFromChannel(channelTitle: string): string | null {
  let name = channelTitle.trim();
  while (CHANNEL_SUFFIXES.test(name)) {
    name = name.replace(CHANNEL_SUFFIXES, '').trim();
  }
  return collapse(name.replace(GLUED_WORDS, '$1 $2')) || null;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
