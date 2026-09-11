import type { Mock } from 'vitest';
import type { Untyped } from 'types/api';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';
import React from 'react';
// apply polyfills for jsdom
import '@nteract/mockument';

// findBy* and waitFor have their own timeout, separate from vitest's, and its
// one second default is not enough once the vm pool has every core rendering a
// different file's component tree. A query that will never match still fails,
// it just takes longer to say so.
configure({ asyncUtilTimeout: 5000 });

// @testing-library/dom decides whether timers are faked by looking for a global
// `jest` object, and only then checks setTimeout for sinon's clock. Under Vitest
// there is no such global, so waitFor concludes the timers are real and polls on
// a clock that nothing advances, which hangs every fake-timer test until the
// suite timeout rather than failing. The one method it calls is enough.
(globalThis as Untyped).jest = {
  advanceTimersByTime: (ms: Untyped) => vi.advanceTimersByTime(ms),
};

// mockument replaces document.createRange with a stub that lacks cloneRange,
// selectNodeContents and the rest of the Range API, which breaks
// @testing-library/user-event's pointer/selection handling. Restore jsdom's
// real Range and graft on the rect methods jsdom doesn't implement (the part
// of the stub the ace/CodeMirror components actually need).
const nativeCreateRange = Document.prototype.createRange;
global.window.document.createRange = function createRange() {
  const range = nativeCreateRange.call(this);
  range.getBoundingClientRect = () => ({ right: 0 }) as DOMRect;
  range.getClientRects = () => [] as unknown as DOMRectList;
  return range;
};

// eslint-disable-next-line import-x/prefer-default-export
export const asyncFlush = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

let hasConsoleError = false;
let hasConsoleWarn = false;
let networkRequestUrl = false;
const { error, warn } = global.console;

global.console = {
  ...console,
  // this ensures that debug messages don't get logged out to the console
  // while tests are running i.e. websocket connect/disconnect
  debug: vi.fn(),
  // fail tests that log errors.
  // adapted from https://github.com/jestjs/jest/issues/6121#issuecomment-708330601
  error: (...args) => {
    if (!networkRequestUrl) {
      hasConsoleError = true;
      error(...args);
    }
  },
  warn: (...args) => {
    const raw = args[0];
    let warnMsg = '';
    if (typeof raw === 'string') {
      warnMsg = raw;
    } else if (raw instanceof Error) {
      warnMsg = raw.message;
    }
    if (
      warnMsg.includes(
        'Formik called `handleChange`, but you forgot to pass an `id` or `name`'
      ) ||
      warnMsg.includes('Table headers must have an accessible name')
    ) {
      return;
    }
    hasConsoleWarn = true;
    warn(...args);
  },
};

const fetchSafeguard = (url: Untyped) => {
  networkRequestUrl = url || true;
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('{}'),
  });
};

global.fetch = vi.fn(fetchSafeguard) as unknown as typeof fetch;

// Re-apply fetch implementation before each test since mockReset clears
// vi.fn implementations between tests.
beforeEach(() => {
  (global.fetch as unknown as Mock).mockImplementation(fetchSafeguard);
});

vi.mock('hooks/useTitle');

// The VM pool reuses one jsdom per worker, so anything written to a browser
// global outlives the file that wrote it. A fresh environment per file used to
// hide that. The URL matters most: a test that navigates would otherwise decide
// where the next file's router starts, which is why the redirect tests were the
// ones failing, and a different one each run.
afterEach(() => {
  // Fake timers are per environment, and the environment outlives the file,
  // so a file that installs them and does not put them back changes how every
  // later file in that worker behaves.
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
  // Optional calls, not defensiveness for its own sake: a test may have
  // replaced window.localStorage with a mock that has no clear().
  window.localStorage?.clear?.();
  window.sessionStorage?.clear?.();
  document.cookie.split(';').forEach((entry) => {
    const name = (entry.split('=')[0] as string).trim();
    if (name) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }
  });
});

afterEach(() => {
  if (networkRequestUrl) {
    const url = networkRequestUrl;
    networkRequestUrl = false;
    throw new Error(
      `Network request was attempted to URL ${url} — API should be stubbed by mocking global.fetch (e.g., global.fetch.mockResolvedValueOnce(...))`
    );
  }
  if (hasConsoleError) {
    hasConsoleError = false;
    throw new Error('Error logged to console');
  }
  if (hasConsoleWarn) {
    hasConsoleWarn = false;
    throw new Error('Warning logged to console');
  }
});

const MockConfigContext = React.createContext({});
vi.doMock('./contexts/Config', () => ({
  __esModule: true,
  ConfigContext: MockConfigContext,
  ConfigProvider: MockConfigContext.Provider,
  Config: MockConfigContext.Consumer,
  useConfig: () => React.useContext(MockConfigContext),
  useAuthorizedPath: vi.fn(),
  useUserProfile: vi.fn(),
}));

// ?
const MockSessionContext = React.createContext({});
vi.doMock('./contexts/Session', () => ({
  __esModule: true,
  SessionContext: MockSessionContext,
  SessionProvider: MockSessionContext.Provider,
  useSession: () => React.useContext(MockSessionContext),
}));
