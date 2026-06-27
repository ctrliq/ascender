import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { AuthAPI, RootAPI, MeAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import AWXLogin from './Login';

import { SESSION_USER_ID } from '../../constants';

jest.mock('../../api/models/Auth.js');
jest.mock('../../api/models/Root.js');
jest.mock('../../api/models/Me.js');

jest.mock('util/auth', () => ({
  getCurrentUserId: jest.fn(),
}));

RootAPI.readAssetVariables.mockResolvedValue({
  data: {
    BRAND_NAME: 'AWX',
  },
});

AuthAPI.read.mockResolvedValue({
  data: {},
});

function getUsernameInput(container) {
  return container.querySelector('#pf-login-username-id');
}

function getPasswordInput(container) {
  return container.querySelector('#pf-login-password-id');
}

function getSubmitButton() {
  return screen.getByRole('button', { name: 'Log In' });
}

async function waitForLoginForm(container) {
  await waitFor(() => expect(getUsernameInput(container)).toBeInTheDocument());
}

describe('<Login />', () => {
  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });

    AuthAPI.read.mockResolvedValue({
      data: {},
    });
    RootAPI.read.mockResolvedValue({
      data: {
        custom_login_info:
          '<div id="custom-button" onmouseover="alert()">TEST</div>',
        custom_logo: 'data:image/jpeg;base64,abc123',
      },
    });
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(() => '42'),
        setItem: jest.fn(() => null),
      },
      writable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders without crashing', async () => {
    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);

    expect(getUsernameInput(container).value).toBe('');
    expect(getPasswordInput(container).value).toBe('');
    expect(getSubmitButton()).not.toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('form has autocomplete off', async () => {
    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    expect(
      container.querySelectorAll('form[autocomplete="off"]')
    ).toHaveLength(1);
  });

  test('custom logo renders Brand component with correct src and alt', async () => {
    const { container } = renderWithContexts(
      <AWXLogin alt="Foo Application" isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    const logo = container.querySelector('img');
    expect(logo.getAttribute('alt')).toBe('Foo Application');
    expect(logo.getAttribute('src')).toBe('data:image/jpeg;base64,abc123');
  });

  test('default logo renders Brand component with correct src and alt', async () => {
    RootAPI.read.mockResolvedValue({ data: {} });
    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    const logo = container.querySelector('img');
    expect(logo.getAttribute('alt')).toBe('AWX');
    expect(logo.getAttribute('src')).toBe('static/media/Ascender_logo.svg');
  });

  test('custom login info handled correctly', async () => {
    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    expect(container.querySelector('footer').outerHTML).toContain(
      '<footer class="pf-v6-c-login__footer" data-cy="login-footer"><div id="custom-button">TEST</div></footer>'
    );
  });

  test('data initialization error is properly handled', async () => {
    RootAPI.read.mockRejectedValueOnce(
      new Error({
        response: {
          config: {
            method: 'get',
            url: '/api/v2',
          },
          data: 'An error occurred',
          status: 500,
        },
      })
    );
    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    const logo = container.querySelector('img');
    expect(logo.getAttribute('alt')).toBe(null);
    expect(logo.getAttribute('src')).toBe('static/media/Ascender_logo.svg');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('state maps to un/pw input value props', async () => {
    const { container, user } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);

    await user.type(getUsernameInput(container), 'un');
    await user.type(getPasswordInput(container), 'pw');

    expect(getUsernameInput(container).value).toEqual('un');
    expect(getPasswordInput(container).value).toEqual('pw');
  });

  test('handles input validation errors and clears on input value change', async () => {
    RootAPI.login.mockRejectedValueOnce(
      new Error({
        response: {
          config: {
            method: 'post',
            url: '/api/login/',
          },
          data: 'An error occurred',
          status: 401,
        },
      })
    );

    const { container, user } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);

    expect(getUsernameInput(container).value).toEqual('');
    expect(getPasswordInput(container).value).toEqual('');
    expect(
      container.querySelector('.pf-v6-c-form__helper-text')
    ).toBeNull();

    await user.type(getUsernameInput(container), 'un');
    await user.type(getPasswordInput(container), 'pw');

    expect(getUsernameInput(container).value).toEqual('un');
    expect(getPasswordInput(container).value).toEqual('pw');

    await user.click(getSubmitButton());

    await waitFor(() =>
      expect(
        container.querySelector('.pf-v6-c-form__helper-text')
      ).toBeInTheDocument()
    );
    expect(getUsernameInput(container)).toHaveAttribute('aria-invalid', 'true');
    expect(getPasswordInput(container)).toHaveAttribute('aria-invalid', 'true');

    await user.clear(getUsernameInput(container));
    await user.type(getUsernameInput(container), 'foo');
    await user.clear(getPasswordInput(container));
    await user.type(getPasswordInput(container), 'bar');

    expect(getUsernameInput(container).value).toEqual('foo');
    expect(getPasswordInput(container).value).toEqual('bar');
    await waitFor(() =>
      expect(
        container.querySelector('.pf-v6-c-form__helper-text')
      ).toBeNull()
    );
    expect(getUsernameInput(container)).toHaveAttribute(
      'aria-invalid',
      'false'
    );
    expect(getPasswordInput(container)).toHaveAttribute(
      'aria-invalid',
      'false'
    );
  });

  test('submit calls api.login successfully', async () => {
    const { container, user } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);

    await user.type(getUsernameInput(container), 'un');
    await user.type(getPasswordInput(container), 'pw');

    await user.click(getSubmitButton());

    await waitFor(() => expect(RootAPI.login).toHaveBeenCalledTimes(1));
    expect(RootAPI.login).toHaveBeenCalledWith('un', 'pw');
  });

  test('render Redirect to / when already authenticated as a new user', async () => {
    MeAPI.read.mockResolvedValue({ data: { results: [{ id: 1 }] } });
    const history = createMemoryHistory({
      initialEntries: ['/login'],
    });
    renderWithContexts(<AWXLogin isAuthenticated={() => true} />, {
      context: {
        router: { history },
        session: {
          authRedirectTo: '/projects',
          handleSessionContinue: () => {},
          isSessionExpired: false,
          isUserBeingLoggedOut: false,
          loginRedirectOverride: null,
          logout: () => {},
          sessionCountdown: 60,
          setAuthRedirectTo: () => {},
        },
      },
    });
    await waitFor(() => expect(MeAPI.read).toHaveBeenCalled());
    await waitFor(() => {
      expect(window.localStorage.getItem).toHaveBeenCalledWith(SESSION_USER_ID);
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        SESSION_USER_ID,
        '1'
      );
      expect(history.location.pathname).toEqual('/home');
    });
  });

  test('render redirect to authRedirectTo when authenticated as a previous user', async () => {
    MeAPI.read.mockResolvedValue({ data: { results: [{ id: 42 }] } });
    const history = createMemoryHistory({
      initialEntries: ['/login'],
    });
    renderWithContexts(<AWXLogin isAuthenticated={() => true} />, {
      context: {
        router: { history },
        session: {
          authRedirectTo: '/projects',
          handleSessionContinue: () => {},
          isSessionExpired: false,
          isUserBeingLoggedOut: false,
          loginRedirectOverride: null,
          logout: () => {},
          sessionCountdown: 60,
          setAuthRedirectTo: () => {},
        },
      },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem).toHaveBeenCalledWith(SESSION_USER_ID);
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        SESSION_USER_ID,
        '42'
      );
      expect(history.location.pathname).toEqual('/projects');
    });
  });

  test('GitHub auth buttons shown', async () => {
    AuthAPI.read.mockResolvedValue({
      data: {
        github: {
          login_url: '/sso/login/github/',
          complete_url: 'https://localhost:8043/sso/complete/github/',
        },
        'github-org': {
          login_url: '/sso/login/github-org/',
          complete_url: 'https://localhost:8043/sso/complete/github-org/',
        },
        'github-team': {
          login_url: '/sso/login/github-team/',
          complete_url: 'https://localhost:8043/sso/complete/github-team/',
        },
      },
    });

    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-cy^="social-auth-github"]')
      ).toHaveLength(3)
    );
    expect(
      container.querySelectorAll('[data-cy="social-auth-azure"]')
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-cy="social-auth-google"]')
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-cy="social-auth-saml"]')
    ).toHaveLength(0);
  });

  test('Google auth button shown', async () => {
    AuthAPI.read.mockResolvedValue({
      data: {
        'google-oauth2': {
          login_url: '/sso/login/google-oauth2/',
          complete_url: 'https://localhost:8043/sso/complete/google-oauth2/',
        },
      },
    });

    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-cy="social-auth-google"]')
      ).toHaveLength(1)
    );
    expect(
      container.querySelectorAll('[data-cy^="social-auth-github"]')
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-cy="social-auth-azure"]')
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-cy="social-auth-saml"]')
    ).toHaveLength(0);
  });

  test('Azure AD auth button shown', async () => {
    AuthAPI.read.mockResolvedValue({
      data: {
        'azuread-oauth2': {
          login_url: '/sso/login/azuread-oauth2/',
          complete_url: 'https://localhost:8043/sso/complete/azuread-oauth2/',
        },
      },
    });

    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-cy="social-auth-azure"]')
      ).toHaveLength(1)
    );
    expect(
      container.querySelectorAll('[data-cy^="social-auth-github"]')
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-cy="social-auth-google"]')
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-cy="social-auth-saml"]')
    ).toHaveLength(0);
  });

  test('SAML auth buttons shown', async () => {
    AuthAPI.read.mockResolvedValue({
      data: {
        saml: {
          login_url: '/sso/login/saml/',
          complete_url: 'https://localhost:8043/sso/complete/saml/',
          metadata_url: '/sso/metadata/saml/',
        },
        'saml:onelogin': {
          login_url: '/sso/login/saml/?idp=onelogin',
          complete_url: 'https://localhost:8043/sso/complete/saml/',
          metadata_url: '/sso/metadata/saml/',
        },
        'saml:someotheridp': {
          login_url: '/sso/login/saml/?idp=someotheridp',
          complete_url: 'https://localhost:8043/sso/complete/saml/',
          metadata_url: '/sso/metadata/saml/',
        },
      },
    });

    const { container } = renderWithContexts(
      <AWXLogin isAuthenticated={() => false} />
    );
    await waitForLoginForm(container);
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-cy="social-auth-saml"]')
      ).toHaveLength(3)
    );
    expect(
      container.querySelectorAll('[data-cy^="social-auth-github"]')
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-cy="social-auth-azure"]')
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-cy="social-auth-google"]')
    ).toHaveLength(0);
  });
});
