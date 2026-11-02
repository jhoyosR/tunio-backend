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
      title: `Title ${id}`,
      channelTitle: 'Channel',
      thumbnails: { medium: { url: `https://img/${id}.jpg` } },
    },
    contentDetails: { duration: 'PT3M' },
    status: { embeddable: true },
    ...overrides,
  });

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

    await expect(client.searchVideos('salsa')).resolves.toEqual([
      {
        youtubeVideoId: 'b',
        title: 'Title b',
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
