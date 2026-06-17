import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { RootAPI } from 'api';
import * as SessionContext from 'contexts/Session';
import * as navigation from 'util/navigation';
import * as auth from 'util/auth';
import { renderWithContexts } from '../testUtils/rtlContexts';
import App, { ProtectedRoute } from './App';

jest.mock('./api');
jest.mock('util/webWorker', () => jest.fn());

// Keep the real `locales` map (App.js validates the active language against it)
// but hold i18n activation pending so App stays on its top-level loading shell.
// This mirrors the original shallow render — it asserts App mounts without
// driving the deep provider tree, whose ConfigProvider/SessionProvider are
// globally mocked in setupTests and warn when mounted without a `value` prop.
jest.mock('./i18nLoader', () => ({
  ...jest.requireActual('./i18nLoader'),
  // plain function, not jest.fn — resetMocks would strip a jest.fn's impl and
  // make App.js's `dynamicActivate(...).then(...)` throw on undefined.
  dynamicActivate: () => new Promise(() => {}),
}));

describe('<App />', () => {
  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
  });

  test('renders ok', async () => {
    const contextValues = {
      setAuthRedirectTo: jest.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: null,
    };
    jest
      .spyOn(SessionContext, 'useSession')
      .mockImplementation(() => contextValues);

    // The default export self-mounts HashRouter/CompatRouter, so render it
    // directly rather than wrapping it again. dynamicActivate is held pending
    // (see mock above) so App stays on its loading shell — asserting the app
    // mounted, the RTL counterpart of the original shallow length check.
    const { container } = render(<App />);
    expect(container).toHaveTextContent('Loading...');
    jest.clearAllMocks();
  });

  test('redirect to login override', async () => {
    const replaceSpy = jest
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});

    expect(replaceSpy).not.toHaveBeenCalled();

    const contextValues = {
      setAuthRedirectTo: jest.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: '/sso/test',
    };
    jest
      .spyOn(SessionContext, 'useSession')
      .mockImplementation(() => contextValues);

    renderWithContexts(
      <ProtectedRoute>
        <div>foo</div>
      </ProtectedRoute>
    );

    await waitFor(() => expect(replaceSpy).toHaveBeenCalled());
    replaceSpy.mockRestore();
  });

  test('renders children when authenticated', async () => {
    jest.spyOn(SessionContext, 'useSession').mockImplementation(() => ({
      setAuthRedirectTo: jest.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: null,
    }));
    jest.spyOn(auth, 'isAuthenticated').mockReturnValue(true);

    renderWithContexts(
      <ProtectedRoute>
        <div id="protected-child">foo</div>
      </ProtectedRoute>
    );

    expect(await screen.findByText('foo')).toBeInTheDocument();
    jest.restoreAllMocks();
  });
});
