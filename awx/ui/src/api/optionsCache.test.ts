import type { Mock } from 'vitest';
import Base from './Base';
import { clearOptionsCache } from './optionsCache';

/** Enough of a Response for the client: ok, a status, a type and a body. */
function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('the OPTIONS cache', () => {
  const fetchMock = () => global.fetch as unknown as Mock;

  beforeEach(() => {
    clearOptionsCache();
    fetchMock().mockImplementation(() =>
      Promise.resolve(jsonResponse({ actions: { GET: {} } }))
    );
  });

  test('asks the API once for an endpoint two callers want', async () => {
    const api = new Base(undefined, '/api/v2/organizations/');

    const [first, second] = await Promise.all([
      api.readOptions(),
      api.readOptions(),
    ]);

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(first.data).toEqual({ actions: { GET: {} } });
    expect(second.data).toEqual(first.data);
  });

  test('serves a later caller from the cache rather than the network', async () => {
    const api = new Base(undefined, '/api/v2/projects/');

    await api.readOptions();
    await api.readOptions();

    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  test('keeps one endpoint out of another endpoint answer', async () => {
    const organizations = new Base(undefined, '/api/v2/organizations/');
    const projects = new Base(undefined, '/api/v2/projects/');

    await organizations.readOptions();
    await projects.readOptions();

    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  test('leaves reads and writes alone, which are not cached', async () => {
    const api = new Base(undefined, '/api/v2/organizations/');

    await api.read();
    await api.read();

    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  test('does not cache a failure, so the next caller tries again', async () => {
    const api = new Base(undefined, '/api/v2/teams/');
    fetchMock().mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{}'),
      } as unknown as Response)
    );

    await expect(api.readOptions()).rejects.toBeDefined();
    await api.readOptions();

    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });
});
