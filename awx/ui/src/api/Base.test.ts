import type { Mock } from 'vitest';
import type { ApiError, Http } from './Base';
import Base from './Base';

/** Only the members mockFetchResponse is ever handed, all of them optional. */
interface FetchResponseOverrides {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
}

// Enough of a Response for the client under test: it reads ok, status, the
// content type and one of json or text.
function mockFetchResponse(overrides: FetchResponseOverrides = {}): Response {
  const headers = new Headers(overrides.headers || {});
  const text =
    overrides.text !== undefined
      ? overrides.text
      : JSON.stringify(overrides.json || {});
  return {
    ok: overrides.ok !== undefined ? overrides.ok : true,
    status: overrides.status || 200,
    headers,
    json: vi.fn(() => Promise.resolve(JSON.parse(text))),
    text: vi.fn(() => Promise.resolve(text)),
  } as unknown as Response;
}

describe('Base', () => {
  const mockBaseURL = '/api/v2/organizations/';

  let BaseAPI: Base;
  // Each method is a vi.fn, so the assertions below can read its calls.
  let mockHttp: Record<keyof Http, Mock>;

  beforeEach(() => {
    const createPromise = () => Promise.resolve();
    mockHttp = {
      delete: vi.fn(createPromise),
      get: vi.fn(createPromise),
      options: vi.fn(createPromise),
      patch: vi.fn(createPromise),
      post: vi.fn(createPromise),
      put: vi.fn(createPromise),
    };
    BaseAPI = new Base(mockHttp as unknown as Http, mockBaseURL);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('create calls http method with expected data', async () => {
    const data = { name: 'test ' };
    await BaseAPI.create(data);

    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post.mock.calls[0]?.[1]).toEqual(data);
  });

  test('destroy calls http method with expected data', async () => {
    const resourceId = 1;
    await BaseAPI.destroy(resourceId);

    expect(mockHttp.delete).toHaveBeenCalledTimes(1);
    expect(mockHttp.delete.mock.calls[0]?.[0]).toEqual(
      `${mockBaseURL}${resourceId}/`
    );
  });

  test('read calls http method with expected data', async () => {
    const testParams = { foo: 'bar' };
    const testParamsDuplicates = { foo: ['bar', 'baz'] };

    await BaseAPI.read(testParams);
    await BaseAPI.read();
    await BaseAPI.read(testParamsDuplicates);

    expect(mockHttp.get).toHaveBeenCalledTimes(3);
    expect(mockHttp.get.mock.calls[0]?.[0]).toEqual(`${mockBaseURL}`);
    expect(mockHttp.get.mock.calls[0]?.[1]).toEqual({ params: { foo: 'bar' } });
    expect(mockHttp.get.mock.calls[1]?.[0]).toEqual(`${mockBaseURL}`);
    expect(mockHttp.get.mock.calls[1]?.[1]).toEqual({ params: undefined });
    expect(mockHttp.get.mock.calls[2]?.[0]).toEqual(`${mockBaseURL}`);
    expect(mockHttp.get.mock.calls[2]?.[1]).toEqual({
      params: { foo: ['bar', 'baz'] },
    });
  });

  test('readDetail calls http method with expected data', async () => {
    const resourceId = 1;

    await BaseAPI.readDetail(resourceId);

    expect(mockHttp.get).toHaveBeenCalledTimes(1);
    expect(mockHttp.get.mock.calls[0]?.[0]).toEqual(
      `${mockBaseURL}${resourceId}/`
    );
  });

  test('readOptions calls http method with expected data', async () => {
    await BaseAPI.readOptions();

    expect(mockHttp.options).toHaveBeenCalledTimes(1);
    expect(mockHttp.options.mock.calls[0]?.[0]).toEqual(`${mockBaseURL}`);
  });

  test('replace calls http method with expected data', async () => {
    const resourceId = 1;
    const data = { name: 'test ' };

    await BaseAPI.replace(resourceId, data);

    expect(mockHttp.put).toHaveBeenCalledTimes(1);
    expect(mockHttp.put.mock.calls[0]?.[0]).toEqual(
      `${mockBaseURL}${resourceId}/`
    );
    expect(mockHttp.put.mock.calls[0]?.[1]).toEqual(data);
  });

  test('update calls http method with expected data', async () => {
    const resourceId = 1;
    const data = { name: 'test ' };

    await BaseAPI.update(resourceId, data);

    expect(mockHttp.patch).toHaveBeenCalledTimes(1);
    expect(mockHttp.patch.mock.calls[0]?.[0]).toEqual(
      `${mockBaseURL}${resourceId}/`
    );
    expect(mockHttp.patch.mock.calls[0]?.[1]).toEqual(data);
  });
});

/** The url and options the client passed to fetch, as this suite reads them. */
function fetchCall(): [
  string,
  RequestInit & { headers: Record<string, string> },
] {
  const [url, options] = vi.mocked(global.fetch).mock.calls[0] as unknown as [
    string,
    RequestInit & { headers: Record<string, string> },
  ];
  return [url, options];
}

describe('defaultHttp (fetch-based client)', () => {
  const mockBaseURL = '/api/v2/items/';
  let api: Base;

  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        mockFetchResponse({
          headers: { 'content-type': 'application/json' },
          json: { results: [] },
        })
      )
    );
    // Clear any cookies from previous tests
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    api = new Base(undefined, mockBaseURL);
  });

  afterEach(() => {
    vi.resetAllMocks();
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  test('GET appends query string from params', async () => {
    await api.read({ page: 1, page_size: 5 });

    const [url] = fetchCall();
    expect(url).toContain('page=1');
    expect(url).toContain('page_size=5');
  });

  test('GET appends params to URLs that already have query strings', async () => {
    await api.http.get('/api/existing?a=1&b=2', { params: { c: 3, d: 4 } });

    const [url] = fetchCall();
    expect(url).toBe('/api/existing?a=1&b=2&c=3&d=4');
  });

  test('GET without params does not append query string', async () => {
    await api.readDetail(42);

    const [url] = fetchCall();
    expect(url).toBe(`${mockBaseURL}42/`);
  });

  test('POST sends JSON body with Content-Type header', async () => {
    const data = { name: 'test' };
    await api.create(data);

    const [, options] = fetchCall();
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe(JSON.stringify(data));
  });

  test('POST with string body sends it as-is without overriding Content-Type', async () => {
    const formData = 'username=foo&password=bar';
    const customHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    await api.http.post('/api/login/', formData, { headers: customHeaders });

    const [, options] = fetchCall();
    expect(options.body).toBe(formData);
    expect(options.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
  });

  test('custom config headers are merged onto defaults', async () => {
    await api.http.get('/api/login/', {
      headers: { 'X-Custom': 'value' },
    });

    const [, options] = fetchCall();
    expect(options.headers['X-Custom']).toBe('value');
    expect(options.headers.Accept).toBe('application/json, text/plain, */*');
  });

  test('CSRF token is included when cookie is set', async () => {
    document.cookie = 'csrftoken=abc123';

    await api.read();

    const [, options] = fetchCall();
    expect(options.headers['X-CSRFToken']).toBe('abc123');
  });

  test('CSRF token is omitted when cookie is not set', async () => {
    document.cookie = '';

    await api.read();

    const [, options] = fetchCall();
    expect(options.headers['X-CSRFToken']).toBeUndefined();
  });

  test('response contains data, status, and headers', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        status: 200,
        headers: { 'content-type': 'application/json' },
        json: { id: 1, name: 'org' },
      })
    );

    const response = await api.readDetail(1);

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ id: 1, name: 'org' });
    expect(response.headers).toBeDefined();
  });

  test('non-2xx response throws error with response attached', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        ok: false,
        status: 404,
        headers: { 'content-type': 'application/json' },
        json: { detail: 'Not found.' },
      })
    );

    let caughtError: ApiError | undefined;
    try {
      await api.readDetail(999);
    } catch (e) {
      caughtError = e as ApiError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toBe('Request failed with status code 404');
    expect(caughtError?.response?.status).toBe(404);
    expect(caughtError?.response?.data).toEqual({ detail: 'Not found.' });
    expect(caughtError?.response?.headers).toBeDefined();
  });

  test('non-JSON response body is returned as text', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        headers: { 'content-type': 'text/html' },
        text: '<html>OK</html>',
      })
    );

    const response = await api.readDetail(1);

    expect(response.data).toBe('<html>OK</html>');
  });

  test('empty JSON response body returns null', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        headers: { 'content-type': 'application/json' },
        text: '',
      })
    );

    const response = await api.readDetail(1);

    expect(response.data).toBe(null);
  });

  test('fetch options like signal are passed through to fetch', async () => {
    const abortController = new AbortController();
    await api.http.get('/api/test/', { signal: abortController.signal });

    const [, options] = fetchCall();
    expect(options.signal).toBe(abortController.signal);
  });

  test('credentials are set to same-origin', async () => {
    await api.read();

    const [, options] = fetchCall();
    expect(options.credentials).toBe('same-origin');
  });
});
