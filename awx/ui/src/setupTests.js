import '@testing-library/jest-dom';
import React from 'react';

require('core-js/actual');

jest.setTimeout(120000);

// apply polyfills for jsdom
require('@nteract/mockument');

// mockument replaces document.createRange with a stub that lacks cloneRange,
// selectNodeContents and the rest of the Range API, which breaks
// @testing-library/user-event's pointer/selection handling. Restore jsdom's
// real Range and graft on the rect methods jsdom doesn't implement (the part
// of the stub the ace/CodeMirror components actually need).
const nativeCreateRange = Document.prototype.createRange;
global.window.document.createRange = function createRange() {
  const range = nativeCreateRange.call(this);
  range.getBoundingClientRect = () => ({ right: 0 });
  range.getClientRects = () => [];
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
  debug: jest.fn(),
  // fail tests that log errors.
  // adapted from https://github.com/facebook/jest/issues/6121#issuecomment-708330601
  error: (...args) => {
    const raw = args[0];
    let msg = '';
    if (typeof raw === 'string') {
      msg = raw;
    } else if (raw instanceof Error) {
      msg = raw.message;
    }
    if (
      !networkRequestUrl &&
      !msg.includes('findDOMNode is deprecated') &&
      !msg.includes('does not recognize the') &&
      !msg.includes('React.jsx: type is invalid') &&
      !msg.includes('is not a valid value for attribute') &&
      !msg.includes('Received NaN for the')
    ) {
      hasConsoleError = true;
      error(...args);
    }
  },
  warn: (...args) => {
    hasConsoleWarn = true;
    warn(...args);
  },
};

const fetchSafeguard = (url) => {
  networkRequestUrl = url || true;
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('{}'),
  });
};

global.fetch = jest.fn(fetchSafeguard);

// Re-apply fetch implementation before each test since resetMocks: true
// clears jest.fn implementations between tests.
beforeEach(() => {
  global.fetch.mockImplementation(fetchSafeguard);
});

jest.mock('hooks/useTitle');

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

// This global variable is part of our Content Security Policy framework
// and so this mock ensures that we don't encounter a reference error
// when running the tests
global.__webpack_nonce__ = null;

const MockConfigContext = React.createContext({});
jest.doMock('./contexts/Config', () => ({
  __esModule: true,
  ConfigContext: MockConfigContext,
  ConfigProvider: MockConfigContext.Provider,
  Config: MockConfigContext.Consumer,
  useConfig: () => React.useContext(MockConfigContext),
  useAuthorizedPath: jest.fn(),
  useUserProfile: jest.fn(),
}));

// ?
const MockSessionContext = React.createContext({});
jest.doMock('./contexts/Session', () => ({
  __esModule: true,
  SessionContext: MockSessionContext,
  SessionProvider: MockSessionContext.Provider,
  useSession: () => React.useContext(MockSessionContext),
}));
