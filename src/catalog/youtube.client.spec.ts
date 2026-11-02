import { ConfigService } from '@nestjs/config';
import {
  parseIsoDuration,
  YoutubeClient,
  YoutubeUnavailableError,
} from './youtube.client';

const API_KEY = 'secret-api-key';

describe('parseIsoDuration', () => {
  it.each([
    ['PT3M25S', 205],
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['P1DT1S', 86401],
    ['P0D', 0],
    ['garbage', 0],
    [undefined, 0],
  ])('%s -> %i segundos', (duration, seconds) => {
    expect(parseIsoDuration(duration)).toBe(seconds);
  });
});

describe('YoutubeClient', () => {
  const fetchMock = jest.fn();
  const client = new YoutubeClient({
    getOrThrow: () => API_KEY,
  } as unknown as ConfigService);

  const jsonResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });

  const video = (id: string, overrides: object = {}) => ({
    id,
    snippet: {
      title: `Artist ${id} - Song ${id} (Official Video)`,
      channelTitle: 'Channel',
      thumbnails: { medium: { url: `https://img/${id}.jpg` } },
    },
    contentDetails: { duration: 'PT3M' },
    status: {
      embeddable: true,
      privacyStatus: 'public',
      uploadStatus: 'processed',
    },
    ...overrides,
  });

  const videosResponse = (...videos: object[]) =>
    jsonResponse({ items: videos });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('combina search.list y videos.list, en el orden de relevancia', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: { videoId: 'b' } }, { id: { videoId: 'a' } }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [video('a'), video('b')] }));

    // Titulo y artista ya salen separados por la regla de song-identity.
    await expect(client.searchVideos('salsa')).resolves.toEqual([
      {
        youtubeVideoId: 'b',
        title: 'Song b',
        artistDisplay: 'Artist b',
        channelTitle: 'Channel',
        durationSeconds: 180,
        thumbnailUrl: 'https://img/b.jpg',
      },
      expect.objectContaining({ youtubeVideoId: 'a' }),
    ]);

    // Los ids van en una sola llamada a videos.list (1 unidad).
    const videosUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(videosUrl.searchParams.get('id')).toBe('b,a');
  });

  it('descarta los no embebibles y los directos sin duracion', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: ['ok', 'blocked', 'live'].map((id) => ({
            id: { videoId: id },
          })),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            video('ok'),
            video('blocked', { status: { embeddable: false } }),
            video('live', { contentDetails: { duration: 'P0D' } }),
          ],
        }),
      );

    const results = await client.searchVideos('salsa');
    expect(results.map((result) => result.youtubeVideoId)).toEqual(['ok']);
  });

  describe('getVideos', () => {
    const lookUp = async (overrides: object) => {
      fetchMock.mockResolvedValueOnce(videosResponse(video('x', overrides)));
      return (await client.getVideos(['x'])).get('x')!.playable;
    };

    it('un video publico, embebible y procesado es reproducible', async () => {
      await expect(lookUp({})).resolves.toBe(true);
    });

    it.each([
      [
        'privado',
        {
          status: {
            embeddable: true,
            privacyStatus: 'private',
            uploadStatus: 'processed',
          },
        },
      ],
      [
        'sin procesar',
        {
          status: {
            embeddable: true,
            privacyStatus: 'public',
            uploadStatus: 'uploaded',
          },
        },
      ],
      [
        'bloqueado en Colombia',
        {
          contentDetails: {
            duration: 'PT3M',
            regionRestriction: { blocked: ['CO', 'US'] },
          },
        },
      ],
      [
        'permitido solo fuera de Colombia',
        {
          contentDetails: {
            duration: 'PT3M',
            regionRestriction: { allowed: ['US'] },
          },
        },
      ],
    ])('%s no es reproducible', async (_case, overrides) => {
      await expect(lookUp(overrides)).resolves.toBe(false);
    });

    it('una restriccion de region que no afecta a Colombia no lo impide', async () => {
      await expect(
        lookUp({
          contentDetails: {
            duration: 'PT3M',
            regionRestriction: { blocked: ['US'] },
          },
        }),
      ).resolves.toBe(true);
    });

    it('un video borrado no aparece en el resultado', async () => {
      fetchMock.mockResolvedValueOnce(videosResponse());
      expect((await client.getVideos(['gone'])).has('gone')).toBe(false);
    });
  });

  it('sin resultados no gasta la llamada a videos.list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));

    await expect(client.searchVideos('zzzz')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un error de YouTube no expone la clave de la API', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    const error = await client.searchVideos('salsa').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YoutubeUnavailableError);
    expect((error as Error).message).not.toContain(API_KEY);
  });

  it('un fallo de red se convierte en YoutubeUnavailableError', async () => {
    fetchMock.mockRejectedValueOnce(
      new Error(`connect failed https://x?key=${API_KEY}`),
    );

    const error = await client.searchVideos('salsa').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YoutubeUnavailableError);
    expect((error as Error).message).not.toContain(API_KEY);
  });
});
