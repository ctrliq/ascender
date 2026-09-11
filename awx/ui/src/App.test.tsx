import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { RootAPI } from 'api';
import * as SessionContext from 'contexts/Session';
import * as navigation from 'util/navigation';
import * as auth from 'util/auth';
import type { SessionValue } from 'contexts/Session';
import { renderWithContexts } from '../testUtils/rtlContexts';
import App, { ProtectedRoute } from './App';

vi.mock('./api');
vi.mock('util/webWorker', () => ({ default: vi.fn() }));

// Keep the real `locales` map (App.js validates the active language against it)
// but hold i18n activation pending so App stays on its top-level loading shell.
// This mirrors the original shallow render — it asserts App mounts without
// driving the deep provider tree, whose ConfigProvider/SessionProvider are
// globally mocked in setupTests and warn when mounted without a `value` prop.
vi.mock('./i18nLoader', async () => ({
  ...(await vi.importActual<typeof import('./i18nLoader')>('./i18nLoader')),
  // plain function, not vi.fn — resetMocks would strip a vi.fn's impl and
  // make App.js's `dynamicActivate(...).then(...)` throw on undefined.
  dynamicActivate: () => new Promise(() => {}),
}));

describe('<App />', () => {
  beforeEach(() => {
    vi.mocked(RootAPI.readAssetVariables).mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    // restoreAllMocks (not clearAllMocks) so vi.spyOn spies are actually
    // restored — with resetMocks:true a leftover spy leaks into later tests
    // (or partial reruns) as a reset spy that returns undefined.
    vi.restoreAllMocks();
  });

  test('renders ok', async () => {
    const contextValues = {
      setAuthRedirectTo: vi.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: null,
    };
    vi.spyOn(SessionContext, 'useSession').mockImplementation(
      () => contextValues as unknown as SessionValue
    );

    // The default export self-mounts the real HashRouter, which logs React
    // Router v6 future-flag warnings ("v7_startTransition" / "v7_relativeSplatPath")
    // on mount. Those are framework deprecation notices, not app warnings — let
    // them through without tripping the setupTests console-warn trap, while any
    // other warning still surfaces.
    const realWarn = global.console.warn;
    vi.spyOn(global.console, 'warn').mockImplementation((...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('React Router Future Flag Warning')
      ) {
        return;
      }
      realWarn(...args);
    });

    // dynamicActivate is held pending (see mock above) so App stays on its
    // loading shell — asserting the app mounted, the RTL counterpart of the
    // original shallow length check.
    const { container } = render(<App />);
    expect(container).toHaveTextContent('Loading...');
  });

  test('redirect to login override', async () => {
    const replaceSpy = vi
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});

    expect(replaceSpy).not.toHaveBeenCalled();

    const contextValues = {
      setAuthRedirectTo: vi.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: '/sso/test',
    };
    vi.spyOn(SessionContext, 'useSession').mockImplementation(
      () => contextValues as unknown as SessionValue
    );

    renderWithContexts(
      <ProtectedRoute>
        <div>foo</div>
      </ProtectedRoute>
    );

    await waitFor(() => expect(replaceSpy).toHaveBeenCalled());
  });

  test('renders children when authenticated', async () => {
    vi.spyOn(SessionContext, 'useSession').mockImplementation(
      () =>
        ({
          setAuthRedirectTo: vi.fn(),
          isSessionExpired: false,
          isUserBeingLoggedOut: false,
          loginRedirectOverride: null,
        }) as unknown as SessionValue
    );
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(true);

    renderWithContexts(
      <ProtectedRoute>
        <div id="protected-child">foo</div>
      </ProtectedRoute>
    );

    expect(await screen.findByText('foo')).toBeInTheDocument();
  });
});
