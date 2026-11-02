// Catalogo semilla (BE-04). Metadatos reales obtenidos UNA vez de YouTube
// (2 de noviembre de 2026) y fijados aqui, para que la demostracion no
// dependa de la red ni de la cuota. Titulo y artista estan escritos a mano:
// la regla automatica para derivar el artista es de BE-11.
// El genero queda sin clasificar a proposito: lo asigna el administrador (BE-21).

export interface SeedSong {
  youtubeVideoId: string;
  title: string;
  artistDisplay: string;
  channelTitle: string;
  durationSeconds: number;
  thumbnailUrl: string;
}

// Vallenato y tropical.
export const TROPICAL_SONGS: SeedSong[] = [
  {
    youtubeVideoId: 'Mtau4v6foHA',
    title: 'Robarte un Beso',
    artistDisplay: 'Carlos Vives, Sebastián Yatra',
    channelTitle: 'CarlosVivesVEVO',
    durationSeconds: 198,
    thumbnailUrl: 'https://i.ytimg.com/vi/Mtau4v6foHA/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'Nmb80HXWsFQ',
    title: 'La Gota Fría',
    artistDisplay: 'Carlos Vives',
    channelTitle: 'Carlos Vives',
    durationSeconds: 218,
    thumbnailUrl: 'https://i.ytimg.com/vi/Nmb80HXWsFQ/mqdefault.jpg',
  },
  {
    youtubeVideoId: '-QkmEVNA-fo',
    title: 'La Tierra del Olvido',
    artistDisplay: 'Carlos Vives',
    channelTitle: 'Carlos Vives',
    durationSeconds: 260,
    thumbnailUrl: 'https://i.ytimg.com/vi/-QkmEVNA-fo/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'baUk9YcCxBQ',
    title: 'Cumbiana',
    artistDisplay: 'Carlos Vives',
    channelTitle: 'CarlosVivesVEVO',
    durationSeconds: 272,
    thumbnailUrl: 'https://i.ytimg.com/vi/baUk9YcCxBQ/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'KIBeny5wq6M',
    title: 'Canción Bonita',
    artistDisplay: 'Carlos Vives, Ricky Martin',
    channelTitle: 'CarlosVivesVEVO',
    durationSeconds: 179,
    thumbnailUrl: 'https://i.ytimg.com/vi/KIBeny5wq6M/mqdefault.jpg',
  },
  {
    youtubeVideoId: '-UV0QGLmYys',
    title: 'La Bicicleta',
    artistDisplay: 'Carlos Vives, Shakira',
    channelTitle: 'CarlosVivesVEVO',
    durationSeconds: 238,
    thumbnailUrl: 'https://i.ytimg.com/vi/-UV0QGLmYys/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'wDeZiEZGS3Q',
    title: 'Me Ilusioné',
    artistDisplay: 'Binomio de Oro de América',
    channelTitle: 'Codiscos',
    durationSeconds: 300,
    thumbnailUrl: 'https://i.ytimg.com/vi/wDeZiEZGS3Q/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'yry3rgGlRUw',
    title: 'Olvídala',
    artistDisplay: 'Binomio de Oro de América',
    channelTitle: 'Codiscos',
    durationSeconds: 268,
    thumbnailUrl: 'https://i.ytimg.com/vi/yry3rgGlRUw/mqdefault.jpg',
  },
  {
    youtubeVideoId: '2A0djyOTwUo',
    title: 'Niña Bonita',
    artistDisplay: 'Binomio de Oro de América',
    channelTitle: 'Codiscos',
    durationSeconds: 309,
    thumbnailUrl: 'https://i.ytimg.com/vi/2A0djyOTwUo/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'gSDdofxMm-Y',
    title: 'Quiero Que Seas Mi Estrella',
    artistDisplay: 'Binomio de Oro de América',
    channelTitle: 'Codiscos',
    durationSeconds: 299,
    thumbnailUrl: 'https://i.ytimg.com/vi/gSDdofxMm-Y/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'X7fzhyZb2rE',
    title: 'Qué Bonito',
    artistDisplay: 'Binomio de Oro de América',
    channelTitle: 'Codiscos',
    durationSeconds: 300,
    thumbnailUrl: 'https://i.ytimg.com/vi/X7fzhyZb2rE/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'LqKscPDW8Y0',
    title: 'Las Locuras Mías',
    artistDisplay: 'Silvestre Dangond',
    channelTitle: 'SilvestreDangondVEVO',
    durationSeconds: 225,
    thumbnailUrl: 'https://i.ytimg.com/vi/LqKscPDW8Y0/mqdefault.jpg',
  },
  {
    youtubeVideoId: '5H8pPtnDWFY',
    title: 'La Vallenata',
    artistDisplay: 'Silvestre Dangond',
    channelTitle: 'SilvestreDangondVEVO',
    durationSeconds: 217,
    thumbnailUrl: 'https://i.ytimg.com/vi/5H8pPtnDWFY/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'KF3HP_MdUl0',
    title: 'Esa Mujer',
    artistDisplay: 'Silvestre Dangond',
    channelTitle: 'SilvestreDangondVEVO',
    durationSeconds: 191,
    thumbnailUrl: 'https://i.ytimg.com/vi/KF3HP_MdUl0/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'BIbonPyTuHQ',
    title: 'Ya No Me Duele Más',
    artistDisplay: 'Silvestre Dangond',
    channelTitle: 'SilvestreDangondVEVO',
    durationSeconds: 262,
    thumbnailUrl: 'https://i.ytimg.com/vi/BIbonPyTuHQ/mqdefault.jpg',
  },
];

// Pop y rock en espanol.
export const POP_ROCK_SONGS: SeedSong[] = [
  {
    youtubeVideoId: 'T_FkEw27XJ0',
    title: 'De Música Ligera',
    artistDisplay: 'Soda Stereo',
    channelTitle: 'SodaStereoVEVO',
    durationSeconds: 211,
    thumbnailUrl: 'https://i.ytimg.com/vi/T_FkEw27XJ0/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'AVEDgT_lG60',
    title: 'En la Ciudad de la Furia',
    artistDisplay: 'Soda Stereo',
    channelTitle: 'SodaStereoVEVO',
    durationSeconds: 377,
    thumbnailUrl: 'https://i.ytimg.com/vi/AVEDgT_lG60/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'ZNzYr4U7Zs8',
    title: 'Cuando Pase el Temblor',
    artistDisplay: 'Soda Stereo',
    channelTitle: 'SodaStereoVEVO',
    durationSeconds: 270,
    thumbnailUrl: 'https://i.ytimg.com/vi/ZNzYr4U7Zs8/mqdefault.jpg',
  },
  {
    youtubeVideoId: '1zzzby2tAQM',
    title: 'Ella Usó Mi Cabeza Como un Revólver',
    artistDisplay: 'Soda Stereo',
    channelTitle: 'SodaStereoVEVO',
    durationSeconds: 273,
    thumbnailUrl: 'https://i.ytimg.com/vi/1zzzby2tAQM/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'HBO2nDIYi0E',
    title: 'Zoom',
    artistDisplay: 'Soda Stereo',
    channelTitle: 'SodaStereoVEVO',
    durationSeconds: 220,
    thumbnailUrl: 'https://i.ytimg.com/vi/HBO2nDIYi0E/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'kMIaYXxLnUA',
    title: 'A Dios Le Pido',
    artistDisplay: 'Juanes',
    channelTitle: 'JuanesVEVO',
    durationSeconds: 211,
    thumbnailUrl: 'https://i.ytimg.com/vi/kMIaYXxLnUA/mqdefault.jpg',
  },
  {
    youtubeVideoId: '-9l5t3MWss8',
    title: 'Es Por Ti',
    artistDisplay: 'Juanes',
    channelTitle: 'JuanesVEVO',
    durationSeconds: 243,
    thumbnailUrl: 'https://i.ytimg.com/vi/-9l5t3MWss8/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'ihE74nG8ioc',
    title: 'Volverte a Ver',
    artistDisplay: 'Juanes',
    channelTitle: 'JuanesVEVO',
    durationSeconds: 238,
    thumbnailUrl: 'https://i.ytimg.com/vi/ihE74nG8ioc/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'voxgN3Dhjuo',
    title: 'Me Enamora',
    artistDisplay: 'Juanes',
    channelTitle: 'JuanesVEVO',
    durationSeconds: 193,
    thumbnailUrl: 'https://i.ytimg.com/vi/voxgN3Dhjuo/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'kRt2sRyup6A',
    title: 'La Camisa Negra',
    artistDisplay: 'Juanes',
    channelTitle: 'JuanesVEVO',
    durationSeconds: 248,
    thumbnailUrl: 'https://i.ytimg.com/vi/kRt2sRyup6A/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'a8Rwz6zBJSE',
    title: 'Suerte',
    artistDisplay: 'Shakira',
    channelTitle: 'shakiraVEVO',
    durationSeconds: 194,
    thumbnailUrl: 'https://i.ytimg.com/vi/a8Rwz6zBJSE/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'Dsp_8Lm1eSk',
    title: 'La Tortura',
    artistDisplay: 'Shakira, Alejandro Sanz',
    channelTitle: 'shakiraVEVO',
    durationSeconds: 225,
    thumbnailUrl: 'https://i.ytimg.com/vi/Dsp_8Lm1eSk/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'B3gbisdtJnA',
    title: 'Ciega, Sordomuda',
    artistDisplay: 'Shakira',
    channelTitle: 'shakiraVEVO',
    durationSeconds: 267,
    thumbnailUrl: 'https://i.ytimg.com/vi/B3gbisdtJnA/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'oBofuVYDoG4',
    title: 'Soltera',
    artistDisplay: 'Shakira',
    channelTitle: 'shakiraVEVO',
    durationSeconds: 249,
    thumbnailUrl: 'https://i.ytimg.com/vi/oBofuVYDoG4/mqdefault.jpg',
  },
  {
    youtubeVideoId: 'XAhTt60W7qo',
    title: 'Loca',
    artistDisplay: 'Shakira, El Cata',
    channelTitle: 'shakiraVEVO',
    durationSeconds: 162,
    thumbnailUrl: 'https://i.ytimg.com/vi/XAhTt60W7qo/mqdefault.jpg',
  },
];
