import Base from './Base';

function mockFetchResponse(overrides = {}) {
  const headers = new Headers(overrides.headers || {});
  return {
    ok: overrides.ok !== undefined ? overrides.ok : true,
    status: overrides.status || 200,
    headers,
    json: jest.fn(() => Promise.resolve(overrides.json || {})),
    text: jest.fn(() => Promise.resolve(overrides.text || '{}')),
  };
}

describe('Base', () => {
  const mockBaseURL = '/api/v2/organizations/';

  let BaseAPI;
  let mockHttp;

  beforeEach(() => {
    const createPromise = () => Promise.resolve();
    mockHttp = {
      delete: jest.fn(createPromise),
      get: jest.fn(createPromise),
      options: jest.fn(createPromise),
      patch: jest.fn(createPromise),
      post: jest.fn(createPromise),
      put: jest.fn(createPromise),
    };
    BaseAPI = new Base(mockHttp, mockBaseURL);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('create calls http method with expected data', async () => {
    const data = { name: 'test ' };
    await BaseAPI.create(data);

    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post.mock.calls[0][1]).toEqual(data);
  });

  test('destroy calls http method with expected data', async () => {
    const resourceId = 1;
    await BaseAPI.destroy(resourceId);

    expect(mockHttp.delete).toHaveBeenCalledTimes(1);
    expect(mockHttp.delete.mock.calls[0][0]).toEqual(
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
    expect(mockHttp.get.mock.calls[0][0]).toEqual(`${mockBaseURL}`);
    expect(mockHttp.get.mock.calls[0][1]).toEqual({ params: { foo: 'bar' } });
    expect(mockHttp.get.mock.calls[1][0]).toEqual(`${mockBaseURL}`);
    expect(mockHttp.get.mock.calls[1][1]).toEqual({ params: undefined });
    expect(mockHttp.get.mock.calls[2][0]).toEqual(`${mockBaseURL}`);
    expect(mockHttp.get.mock.calls[2][1]).toEqual({
      params: { foo: ['bar', 'baz'] },
    });
  });

  test('readDetail calls http method with expected data', async () => {
    const resourceId = 1;

    await BaseAPI.readDetail(resourceId);

    expect(mockHttp.get).toHaveBeenCalledTimes(1);
    expect(mockHttp.get.mock.calls[0][0]).toEqual(
      `${mockBaseURL}${resourceId}/`
    );
  });

  test('readOptions calls http method with expected data', async () => {
    await BaseAPI.readOptions();

    expect(mockHttp.options).toHaveBeenCalledTimes(1);
    expect(mockHttp.options.mock.calls[0][0]).toEqual(`${mockBaseURL}`);
  });

  test('replace calls http method with expected data', async () => {
    const resourceId = 1;
    const data = { name: 'test ' };

    await BaseAPI.replace(resourceId, data);

    expect(mockHttp.put).toHaveBeenCalledTimes(1);
    expect(mockHttp.put.mock.calls[0][0]).toEqual(
      `${mockBaseURL}${resourceId}/`
    );
    expect(mockHttp.put.mock.calls[0][1]).toEqual(data);
  });

  test('update calls http method with expected data', async () => {
    const resourceId = 1;
    const data = { name: 'test ' };

    await BaseAPI.update(resourceId, data);

    expect(mockHttp.patch).toHaveBeenCalledTimes(1);
    expect(mockHttp.patch.mock.calls[0][0]).toEqual(
      `${mockBaseURL}${resourceId}/`
    );
    expect(mockHttp.patch.mock.calls[0][1]).toEqual(data);
  });
});

describe('defaultHttp (fetch-based client)', () => {
  const mockBaseURL = '/api/v2/items/';
  let api;

  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve(mockFetchResponse({
        headers: { 'content-type': 'application/json' },
        json: { results: [] },
      }))
    );
    // Clear any cookies from previous tests
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    api = new Base(undefined, mockBaseURL);
  });

  afterEach(() => {
    jest.resetAllMocks();
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  test('GET appends query string from params', async () => {
    await api.read({ page: 1, page_size: 5 });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('page=1');
    expect(url).toContain('page_size=5');
  });

  test('GET without params does not append query string', async () => {
    await api.readDetail(42);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe(`${mockBaseURL}42/`);
  });

  test('POST sends JSON body with Content-Type header', async () => {
    const data = { name: 'test' };
    await api.create(data);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe(JSON.stringify(data));
  });

  test('POST with string body sends it as-is without overriding Content-Type', async () => {
    const formData = 'username=foo&password=bar';
    const customHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };

    await api.http.post('/api/login/', formData, { headers: customHeaders });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.body).toBe(formData);
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  test('custom config headers are merged onto defaults', async () => {
    await api.http.get('/api/login/', {
      headers: { 'X-Custom': 'value' },
    });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['X-Custom']).toBe('value');
    expect(options.headers.Accept).toBe('application/json, text/plain, */*');
  });

  test('CSRF token is included when cookie is set', async () => {
    document.cookie = 'csrftoken=abc123';

    await api.read();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['X-CSRFToken']).toBe('abc123');
  });

  test('CSRF token is omitted when cookie is not set', async () => {
    document.cookie = '';

    await api.read();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['X-CSRFToken']).toBeUndefined();
  });

  test('response contains data, status, and headers', async () => {
    global.fetch.mockResolvedValueOnce(
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
    global.fetch.mockResolvedValueOnce(
      mockFetchResponse({
        ok: false,
        status: 404,
        headers: { 'content-type': 'application/json' },
        json: { detail: 'Not found.' },
      })
    );

    let caughtError;
    try {
      await api.readDetail(999);
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toBe('Request failed with status code 404');
    expect(caughtError.response.status).toBe(404);
    expect(caughtError.response.data).toEqual({ detail: 'Not found.' });
    expect(caughtError.response.headers).toBeDefined();
  });

  test('non-JSON response body is returned as text', async () => {
    global.fetch.mockResolvedValueOnce(
      mockFetchResponse({
        headers: { 'content-type': 'text/html' },
        text: '<html>OK</html>',
      })
    );

    const response = await api.readDetail(1);

    expect(response.data).toBe('<html>OK</html>');
  });

  test('credentials are set to same-origin', async () => {
    await api.read();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.credentials).toBe('same-origin');
  });
});
