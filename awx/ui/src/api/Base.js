/* eslint-disable default-param-last */
import { encodeQueryString } from 'util/qs';
import debounce from 'util/debounce';
import { SESSION_TIMEOUT_KEY } from '../constants';

const updateStorage = debounce((key, val) => {
  window.localStorage.setItem(key, val);
  window.dispatchEvent(new Event('storage'));
}, 500);

function getCookie(name) {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function headersToObject(fetchHeaders) {
  const obj = {};
  fetchHeaders.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

async function handleResponse(fetchResponse) {
  const headers = headersToObject(fetchResponse.headers);
  const { status } = fetchResponse;
  let data;
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
    const error = new Error(
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

function buildUrl(url, params) {
  if (!params) return url;
  const qs = encodeQueryString(params);
  return qs ? `${url}?${qs}` : url;
}

function makeRequest(method, url, dataOrConfig, config) {
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = hasBody ? dataOrConfig : undefined;
  const reqConfig = hasBody ? config : dataOrConfig;
  const params = reqConfig?.params;

  const fetchUrl = buildUrl(url, params);
  const headers = { Accept: 'application/json, text/plain, */*' };

  const csrfToken = getCookie('csrftoken');
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  if (reqConfig?.headers) {
    Object.assign(headers, reqConfig.headers);
  }

  const fetchOptions = { method, headers, credentials: 'same-origin' };

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

  return fetch(fetchUrl, fetchOptions).then(handleResponse);
}

const defaultHttp = {
  get: (url, config) => makeRequest('GET', url, config),
  post: (url, data, config) => makeRequest('POST', url, data, config),
  put: (url, data, config) => makeRequest('PUT', url, data, config),
  patch: (url, data, config) => makeRequest('PATCH', url, data, config),
  delete: (url, config) => makeRequest('DELETE', url, config),
  options: (url, config) => makeRequest('OPTIONS', url, config),
};

class Base {
  constructor(http = defaultHttp, baseURL) {
    this.http = http;
    this.baseUrl = baseURL;
  }

  create(data) {
    return this.http.post(this.baseUrl, data);
  }

  destroy(id) {
    return this.http.delete(`${this.baseUrl}${id}/`);
  }

  read(params) {
    return this.http.get(this.baseUrl, {
      params,
    });
  }

  readDetail(id) {
    return this.http.get(`${this.baseUrl}${id}/`);
  }

  readOptions() {
    return this.http.options(this.baseUrl);
  }

  replace(id, data) {
    return this.http.put(`${this.baseUrl}${id}/`, data);
  }

  update(id, data) {
    return this.http.patch(`${this.baseUrl}${id}/`, data);
  }

  copy(id, data) {
    return this.http.post(`${this.baseUrl}${id}/copy/`, data);
  }
}

export default Base;
