import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import OIDCEdit from './OIDCEdit';

vi.mock('../../../../api');

describe('<OIDCEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.revertCategory).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.revertCategory>
    );
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        SOCIAL_AUTH_OIDC_KEY: 'mock key',
        SOCIAL_AUTH_OIDC_SECRET: '$encrypted$',
        SOCIAL_AUTH_OIDC_OIDC_ENDPOINT: 'https://example.com',
        SOCIAL_AUTH_OIDC_VERIFY_SSL: true,
        SOCIAL_AUTH_OIDC_CALLBACK_URL:
          'https://ascender.example.com/sso/complete/oidc/',
        SOCIAL_AUTH_OIDC_SCOPE: ['groups'],
        SOCIAL_AUTH_OIDC_USERNAME_KEY: 'preferred_username',
        SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN: false,
        SOCIAL_AUTH_OIDC_GROUPS_CLAIM: 'groups',
        SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS: null,
        SOCIAL_AUTH_OIDC_ORGANIZATION_MAP: null,
        SOCIAL_AUTH_OIDC_TEAM_MAP: {
          Operators: {
            organization: 'Default',
            triggers: { groups: { has_or: ['ops'] } },
          },
        },
        SOCIAL_AUTH_OIDC_USER_FLAGS: null,
        SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP: false,
        SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL: '',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/authentication/oidc/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <OIDCEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('should display expected form fields', async () => {
    await renderEdit();
    expect(screen.getByText('OIDC Key')).toBeInTheDocument();
    expect(screen.getByText('OIDC Secret')).toBeInTheDocument();
    expect(screen.getByText('OIDC Provider URL')).toBeInTheDocument();
    expect(
      screen.getByText('Verify OIDC Provider Certificate')
    ).toBeInTheDocument();
    expect(screen.getByText('OIDC Username Claim')).toBeInTheDocument();
    expect(screen.getByText('OIDC Groups Claim')).toBeInTheDocument();
    expect(
      screen.getByText('Strip the Domain from OIDC Usernames')
    ).toBeInTheDocument();
    expect(screen.getByText('OIDC Additional Scopes')).toBeInTheDocument();
    expect(screen.getByText('OIDC Login Rule')).toBeInTheDocument();
    expect(screen.getByText('OIDC Organization Map')).toBeInTheDocument();
    expect(screen.getByText('OIDC Team Map')).toBeInTheDocument();
    expect(screen.getByText('OIDC User Flags')).toBeInTheDocument();
    expect(
      screen.getByText('Log Out of the OIDC Provider')
    ).toBeInTheDocument();
    expect(
      screen.getByText('OIDC Post Logout Redirect URL')
    ).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert Settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert All to Default' })
    );
    expect(await screen.findByText('Revert Settings')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // Only the settings this page shows, each at its default: a DELETE on
    // the category would reset what the page does not show as well.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SOCIAL_AUTH_OIDC_KEY: null,
      SOCIAL_AUTH_OIDC_SECRET: '',
      SOCIAL_AUTH_OIDC_OIDC_ENDPOINT: '',
      SOCIAL_AUTH_OIDC_VERIFY_SSL: true,
      SOCIAL_AUTH_OIDC_SCOPE: [],
      SOCIAL_AUTH_OIDC_USERNAME_KEY: 'preferred_username',
      SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN: false,
      SOCIAL_AUTH_OIDC_GROUPS_CLAIM: 'groups',
      SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS: null,
      SOCIAL_AUTH_OIDC_ORGANIZATION_MAP: null,
      SOCIAL_AUTH_OIDC_TEAM_MAP: null,
      SOCIAL_AUTH_OIDC_USER_FLAGS: null,
      SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP: false,
      SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL: '',
    });
    expect(SettingsAPI.revertCategory).not.toHaveBeenCalled();
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await renderEdit();
    await user.click(
      container.querySelector(
        'button[data-ouia-component-id="SOCIAL_AUTH_OIDC_SECRET-revert"]'
      )!
    );
    const keyInput = container.querySelector('#SOCIAL_AUTH_OIDC_KEY');
    await user.clear(keyInput!);
    await user.type(keyInput!, 'new key');
    const endpointInput = container.querySelector(
      '#SOCIAL_AUTH_OIDC_OIDC_ENDPOINT'
    );
    await user.clear(endpointInput!);
    await user.type(endpointInput!, 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SOCIAL_AUTH_OIDC_KEY: 'new key',
      SOCIAL_AUTH_OIDC_SECRET: '',
      SOCIAL_AUTH_OIDC_OIDC_ENDPOINT: 'https://example.com',
      SOCIAL_AUTH_OIDC_VERIFY_SSL: true,
      SOCIAL_AUTH_OIDC_SCOPE: ['groups'],
      SOCIAL_AUTH_OIDC_USERNAME_KEY: 'preferred_username',
      SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN: false,
      SOCIAL_AUTH_OIDC_GROUPS_CLAIM: 'groups',
      SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS: null,
      SOCIAL_AUTH_OIDC_ORGANIZATION_MAP: null,
      SOCIAL_AUTH_OIDC_TEAM_MAP: {
        Operators: {
          organization: 'Default',
          triggers: { groups: { has_or: ['ops'] } },
        },
      },
      SOCIAL_AUTH_OIDC_USER_FLAGS: null,
      SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP: false,
      SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL: '',
    });
  });

  test('should navigate to OIDC detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/authentication/oidc/details')
    );
  });

  test('should navigate to OIDC detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/authentication/oidc/details');
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    vi.mocked(SettingsAPI.updateAll).mockImplementation(() =>
      Promise.reject(error)
    );
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    vi.mocked(SettingsAPI.readCategory).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await renderEdit();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
