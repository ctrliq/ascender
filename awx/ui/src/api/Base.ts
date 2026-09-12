// The http transport is defaulted and the base url is not, which reads
// backwards but is the constructor every model already calls. Renaming it is
// a change to 40 subclasses, not to this file.

// These three are still JavaScript. allowJs means their types are inferred
// rather than declared, which is the point of adopting this a file at a time.
import { encodeQueryString } from 'util/qs';
import type { QSParams } from 'util/qs';
import debounce from 'util/debounce';
import type { ApiResponse, OptionsResponse, Paginated } from '../types/api';
import { SESSION_TIMEOUT_KEY } from '../constants';

// Declared with the api types, and re-exported here because every caller
// reaches it through the transport rather than through the type module.
export type { ApiResponse };

/** An error thrown by a failed request, carrying the response with it. */
export interface ApiError extends Error {
  response?: ApiResponse;
}

/** The per-request options this client accepts, a subset of fetch's own. */
export interface RequestConfig extends Partial<Omit<RequestInit, 'headers'>> {
  params?: QSParams;
  headers?: Record<string, string>;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

/**
 * The transport every model talks through. Declared as an interface because
 * the test suite substitutes its own, and typing it is what makes a mock that
 * does not match the real client a build error rather than a runtime surprise.
 */
export interface Http {
  get<T = unknown>(
    url: string,
    config?: RequestConfig
  ): Promise<ApiResponse<T>>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>>;
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>>;
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>>;
  delete<T = unknown>(
    url: string,
    config?: RequestConfig
  ): Promise<ApiResponse<T>>;
  options<T = unknown>(
    url: string,
    config?: RequestConfig
  ): Promise<ApiResponse<T>>;
}

const updateStorage = debounce((key: string, val: string) => {
  window.localStorage.setItem(key, val);
  window.dispatchEvent(new Event('storage'));
}, 500);

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  // match[1] is only present when the pattern matched with its group, which
  // the old code assumed. An empty cookie value reaches here as ''.
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
}

function headersToObject(fetchHeaders: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  fetchHeaders.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

async function handleResponse(fetchResponse: Response): Promise<ApiResponse> {
  const headers = headersToObject(fetchResponse.headers);
  const { status } = fetchResponse;
  let data: unknown;
  const contentType = headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    const text = await fetchResponse.text();
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = null;
    }
  } else {
    const text = await fetchResponse.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  const response = { data, status, headers };

  if (!fetchResponse.ok) {
    const error: ApiError = new Error(
      `Request failed with status code ${status}`
    );
    error.response = response;
    throw error;
  }

  const timeout = headers['session-timeout'];
  if (timeout) {
    const timeoutDate = new Date().getTime() + Number(timeout) * 1000;
    updateStorage(SESSION_TIMEOUT_KEY, String(timeoutDate));
  }

  return response;
}

function buildUrl(url: string, params?: QSParams): string {
  if (!params) return url;
  const qs = encodeQueryString(params);
  if (!qs) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${qs}`;
}

function makeRequest<T = unknown>(
  method: HttpMethod,
  url: string,
  dataOrConfig?: unknown,
  config?: RequestConfig
): Promise<ApiResponse<T>> {
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = hasBody ? dataOrConfig : undefined;
  const reqConfig = (hasBody ? config : dataOrConfig) as
    RequestConfig | undefined;
  const params = reqConfig?.params;

  const fetchUrl = buildUrl(url, params);
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
  };

  const csrfToken = getCookie('csrftoken');
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  if (reqConfig?.headers) {
    Object.assign(headers, reqConfig.headers);
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'same-origin',
  };

  // Pass through fetch-specific options
  const fetchOptionKeys: (keyof RequestInit)[] = [
    'signal',
    'cache',
    'redirect',
    'referrer',
    'referrerPolicy',
    'mode',
    'credentials',
  ];
  if (reqConfig) {
    fetchOptionKeys.forEach((key) => {
      const value = (reqConfig as Record<string, unknown>)[key];
      if (value !== undefined) {
        (fetchOptions as Record<string, unknown>)[key] = value;
      }
    });
  }

  if (body !== undefined) {
    if (typeof body === 'string') {
      fetchOptions.body = body;
    } else {
      if (!new Headers(headers).has('content-type')) {
        headers['Content-Type'] = 'application/json';
      }
      fetchOptions.body = JSON.stringify(body);
    }
  }

  return fetch(fetchUrl, fetchOptions).then(handleResponse) as Promise<
    ApiResponse<T>
  >;
}

const defaultHttp: Http = {
  get: (url, config) => makeRequest('GET', url, config),
  post: (url, data, config) => makeRequest('POST', url, data, config),
  put: (url, data, config) => makeRequest('PUT', url, data, config),
  patch: (url, data, config) => makeRequest('PATCH', url, data, config),
  delete: (url, config) => makeRequest('DELETE', url, config),
  options: (url, config) => makeRequest('OPTIONS', url, config),
};

/**
 * The endpoints every model gets for free, over whichever resource it serves.
 *
 * The resource is the type parameter, so `Base<Team>` answers a page of teams
 * from read() and one team from readDetail(). A subclass reached through a
 * mixin cannot pass it along, so those models override the calls they use
 * instead. Every method still takes its own type argument, for the endpoints
 * that answer with something other than the resource.
 */
class Base<TModel = unknown> {
  http: Http;

  baseUrl: string;

  // baseURL is optional because almost every subclass calls super(http) and
  // then assigns this.baseUrl itself, which is the pattern all 51 models use.
  constructor(http: Http = defaultHttp, baseURL = '') {
    this.http = http;
    this.baseUrl = baseURL;
  }

  create<T = TModel>(data?: unknown) {
    return this.http.post<T>(this.baseUrl, data);
  }

  destroy<T = void>(id: number | string) {
    return this.http.delete<T>(`${this.baseUrl}${id}/`);
  }

  read<T = Paginated<TModel>>(params?: QSParams) {
    return this.http.get<T>(this.baseUrl, {
      params,
    });
  }

  readDetail<T = TModel>(id: number | string) {
    return this.http.get<T>(`${this.baseUrl}${id}/`);
  }

  readOptions<T = OptionsResponse>() {
    return this.http.options<T>(this.baseUrl);
  }

  replace<T = TModel>(id: number | string, data?: unknown) {
    return this.http.put<T>(`${this.baseUrl}${id}/`, data);
  }

  update<T = TModel>(id: number | string, data?: unknown) {
    return this.http.patch<T>(`${this.baseUrl}${id}/`, data);
  }

  copy<T = TModel>(id: number | string, data?: unknown) {
    return this.http.post<T>(`${this.baseUrl}${id}/copy/`, data);
  }
}

/**
 * What a mixin factory accepts. The mixins in api/mixins are functions taking
 * a class and returning a subclass of it, so each needs its parent constrained
 * to something that actually has an http and a baseUrl to call through.
 */
// any[] rather than never[] or unknown[] is required here, not a shortcut:
// TypeScript only recognises a class as a mixin base when its constructor
// takes a single rest parameter of exactly any[], and rejects it as TS2545
// otherwise.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = object> = new (...args: any[]) => T;
export type BaseConstructor = Constructor<Base>;

export default Base;
