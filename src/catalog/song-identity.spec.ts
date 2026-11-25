import { deriveSongIdentity } from './song-identity';

// Casos tomados de resultados reales de YouTube.
describe('deriveSongIdentity', () => {
  it.each([
    [
      'Carlos Vives - La Gota Fría (Oficial) (1993)',
      'Carlos Vives',
      { artistDisplay: 'Carlos Vives', title: 'La Gota Fría (1993)' },
    ],
    [
      'Carlos Vives, Sebastián Yatra - Robarte un Beso (Official Video)',
      'CarlosVivesVEVO',
      {
        artistDisplay: 'Carlos Vives, Sebastián Yatra',
        title: 'Robarte un Beso',
      },
    ],
    [
      'Shakira - La Tortura (Official HD Video) ft. Alejandro Sanz',
      'shakiraVEVO',
      { artistDisplay: 'Shakira', title: 'La Tortura ft. Alejandro Sanz' },
    ],
    [
      'Joe Arroyo - Rebelion (Audio) | Discos Fuentes',
      'Discos Fuentes Edimusica',
      { artistDisplay: 'Joe Arroyo', title: 'Rebelion' },
    ],
    [
      'Juanes - A Dios Le Pido',
      'JuanesVEVO',
      { artistDisplay: 'Juanes', title: 'A Dios Le Pido' },
    ],
  ])('con separador: %s', (title, channel, expected) => {
    expect(deriveSongIdentity(title, channel)).toEqual(expected);
  });

  it.each([
    ['Cali Pachanguero', 'Grupo Niche - Topic', 'Grupo Niche'],
    ['Las Locuras Mías', 'SilvestreDangondVEVO', 'Silvestre Dangond'],
    ['La Bicicleta', 'Carlos Vives Oficial', 'Carlos Vives'],
  ])(
    'sin separador, el artista sale del canal: %s',
    (title, channel, artist) => {
      expect(deriveSongIdentity(title, channel)).toEqual({
        title,
        artistDisplay: artist,
      });
    },
  );

  it('quita el relleno pero conserva los parentesis con contenido', () => {
    expect(
      deriveSongIdentity(
        'Waka Waka (Esto es Africa) (Cancion Oficial de la Copa Mundial)',
        'shakiraVEVO',
      ),
    ).toEqual({
      title: 'Waka Waka (Esto es Africa)',
      artistDisplay: 'shakira',
    });
  });

  it('descarta lo que sigue a una barra vertical', () => {
    expect(
      deriveSongIdentity('Tu Serenata Diomedes Díaz |Letra|', 'Vallenato TV'),
    ).toEqual({
      title: 'Tu Serenata Diomedes Díaz',
      artistDisplay: 'Vallenato TV',
    });
  });

  it.each([
    [
      'Me Ilusioné, Binomio De Oro De América - Video Oficial',
      { title: 'Me Ilusioné', artistDisplay: 'Binomio De Oro De América' },
    ],
    [
      'Cali Pachanguero, Grupo Niche - Video Letra',
      { title: 'Cali Pachanguero', artistDisplay: 'Grupo Niche' },
    ],
    [
      'Olvídala, Binomio De Oro, Rafael Orozco - Video Oficial',
      { title: 'Olvídala', artistDisplay: 'Binomio De Oro, Rafael Orozco' },
    ],
  ])(
    'formato de disquera "Cancion, Artista - Video": %s',
    (title, expected) => {
      expect(deriveSongIdentity(title, 'Codiscos')).toEqual(expected);
    },
  );

  it('una coma sin relleno detras del guion no activa el formato de disquera', () => {
    expect(
      deriveSongIdentity('Carlos Vives, Shakira - La Bicicleta', 'Canal'),
    ).toEqual({
      artistDisplay: 'Carlos Vives, Shakira',
      title: 'La Bicicleta',
    });
  });

  it('una coma sin guion tampoco: el artista sale del canal', () => {
    expect(
      deriveSongIdentity('Suerte (Whenever, Wherever)', 'shakiraVEVO'),
    ).toEqual({
      title: 'Suerte (Whenever, Wherever)',
      artistDisplay: 'shakira',
    });
  });

  it('limite documentado: el orden invertido se lee al reves', () => {
    expect(
      deriveSongIdentity('TU SERENATA - Diomedes Díaz', 'Keiner Torres'),
    ).toEqual({ artistDisplay: 'TU SERENATA', title: 'Diomedes Díaz' });
  });

  it('nunca deja el titulo vacio', () => {
    expect(deriveSongIdentity('(Official Video)', 'Canal')).toEqual({
      title: '(Official Video)',
      artistDisplay: 'Canal',
    });
  });

  it('es determinista', () => {
    const title = 'Soda Stereo - Zoom (Official Video)';
    expect(deriveSongIdentity(title, 'SodaStereoVEVO')).toEqual(
      deriveSongIdentity(title, 'SodaStereoVEVO'),
    );
  });
});
