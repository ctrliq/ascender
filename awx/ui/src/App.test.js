import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { RootAPI } from 'api';
import * as SessionContext from 'contexts/Session';
import * as navigation from 'util/navigation';
import * as auth from 'util/auth';
import { renderWithContexts } from '../testUtils/rtlContexts';
import { createMemoryHistory } from 'history';
import { SESSION_REDIRECT_URL } from './constants';
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

  afterEach(() => {
    // restoreAllMocks (not clearAllMocks) so jest.spyOn spies are actually
    // restored — with resetMocks:true a leftover spy leaks into later tests
    // (or partial reruns) as a reset spy that returns undefined.
    jest.restoreAllMocks();
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

    // The default export self-mounts the real HashRouter, which logs React
    // Router v6 future-flag warnings ("v7_startTransition" / "v7_relativeSplatPath")
    // on mount. Those are framework deprecation notices, not app warnings — let
    // them through without tripping the setupTests console-warn trap, while any
    // other warning still surfaces.
    const realWarn = global.console.warn;
    jest.spyOn(global.console, 'warn').mockImplementation((...args) => {
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
    const replaceSpy = jest
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});
    const submit = jest
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => {});

    expect(replaceSpy).not.toHaveBeenCalled();

    // An override that is not social-auth's login view (here an external
    // portal) is a plain navigation, and never receives the CSRF token.
    const contextValues = {
      setAuthRedirectTo: jest.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: 'https://portal.example.com/login',
    };
    jest
      .spyOn(SessionContext, 'useSession')
      .mockImplementation(() => contextValues);

    renderWithContexts(
      <ProtectedRoute>
        <div>foo</div>
      </ProtectedRoute>
    );

    await waitFor(() =>
      expect(replaceSpy).toHaveBeenCalledWith(
        'https://portal.example.com/login'
      )
    );
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('form[action^="https://portal"]')).toBeNull();
  });

  test('login override to a social-auth login URL is POSTed', async () => {
    // social-auth-app-django 6.x answers a GET on /sso/login/<backend>/
    // with 405, so this override has to leave the page with a CSRF form.
    const replaceSpy = jest
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});
    const submit = jest
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => {});
    document.cookie = 'csrftoken=TESTTOKEN';
    window.sessionStorage.removeItem(SESSION_REDIRECT_URL);

    const contextValues = {
      setAuthRedirectTo: jest.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      loginRedirectOverride: '/sso/login/saml/?idp=corp',
    };
    jest
      .spyOn(SessionContext, 'useSession')
      .mockImplementation(() => contextValues);

    renderWithContexts(
      <ProtectedRoute>
        <div>foo</div>
      </ProtectedRoute>,
      {
        context: {
          router: {
            history: createMemoryHistory({
              initialEntries: ['/jobs/playbook/42?tab=output'],
            }),
          },
        },
      }
    );

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const form = document.querySelector(
      'form[action="/sso/login/saml/?idp=corp"]'
    );
    expect(form).not.toBeNull();
    expect(form.method).toEqual('post');
    expect(
      form.querySelector('input[name="csrfmiddlewaretoken"]').value
    ).toEqual('TESTTOKEN');
    expect(replaceSpy).not.toHaveBeenCalled();
    // The provider round trip unloads the page, so where the user was
    // heading is kept the way the login page's own provider buttons keep it.
    expect(window.sessionStorage.getItem(SESSION_REDIRECT_URL)).toEqual(
      '/jobs/playbook/42?tab=output'
    );

    form.remove();
    window.sessionStorage.removeItem(SESSION_REDIRECT_URL);
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  test('login override with a script scheme is ignored', async () => {
    // An admin-typed javascript: URL would run in every unauthenticated
    // visitor's browser. The API refuses to store one; a stored one is not
    // followed, and the visitor lands on the login page instead.
    const replaceSpy = jest
      .spyOn(navigation, 'default')
      .mockImplementation(() => {});
    const submit = jest
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => {});

    const contextValues = {
      setAuthRedirectTo: jest.fn(),
      isSessionExpired: false,
      isUserBeingLoggedOut: false,
      // The literal is the very value under test.
      // eslint-disable-next-line no-script-url
      loginRedirectOverride: 'javascript:alert(document.cookie)',
    };
    jest
      .spyOn(SessionContext, 'useSession')
      .mockImplementation(() => contextValues);

    const history = createMemoryHistory({ initialEntries: ['/jobs'] });
    renderWithContexts(
      <ProtectedRoute>
        <div>foo</div>
      </ProtectedRoute>,
      { context: { router: { history } } }
    );

    await waitFor(() => expect(history.location.pathname).toEqual('/login'));
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByText('foo')).not.toBeInTheDocument();
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
  });
});
