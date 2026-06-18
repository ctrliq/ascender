import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import MiscAuthenticationDetail from './MiscAuthenticationDetail';

jest.mock('../../../../api');

describe('<MiscAuthenticationDetail />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory = jest.fn();
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SESSION_COOKIE_AGE: 1800,
        SESSIONS_PER_USER: -1,
        DISABLE_LOCAL_AUTH: false,
        AUTH_BASIC_ENABLED: true,
        OAUTH2_PROVIDER: {
          ACCESS_TOKEN_EXPIRE_SECONDS: 31536000000,
          REFRESH_TOKEN_EXPIRE_SECONDS: 2628000,
          AUTHORIZATION_CODE_EXPIRE_SECONDS: 600,
        },
        ALLOW_OAUTH2_FOR_EXTERNAL_USERS: false,
        LOGIN_REDIRECT_OVERRIDE: 'https://foohost',
        AUTHENTICATION_BACKENDS: [
          'awx.sso.backends.TACACSPlusBackend',
          'awx.main.backends.AWXModelBackend',
        ],
        SOCIAL_AUTH_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_TEAM_MAP: {},
        SOCIAL_AUTH_USER_FIELDS: [],
        SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL: false,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderDetail(context) {
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <MiscAuthenticationDetail />
      </SettingsProvider>,
      context
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderDetail();
    expect(
      screen.getByText('Disable the built-in authentication system')
    ).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await renderDetail();
    const expectedTabs = ['Back to Settings', 'Details'];
    expectedTabs.forEach((tab) => {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
    });
  });

  test('should render expected details', async () => {
    await renderDetail();
    assertDetail('Disable the built-in authentication system', 'Off');
    // CodeEditor (object/list types) renders empty under jsdom; assert the label.
    expect(screen.getByText('OAuth 2 Timeout Settings')).toBeInTheDocument();
    assertDetail('Login redirect override URL', 'https://foohost');
    expect(screen.getByText('Authentication Backends')).toBeInTheDocument();
    expect(
      screen.getByText('Social Auth Organization Map')
    ).toBeInTheDocument();
    expect(screen.getByText('Social Auth Team Map')).toBeInTheDocument();
    expect(screen.getByText('Social Auth User Fields')).toBeInTheDocument();
    assertDetail('Use Email address for usernames', 'Off');
    assertDetail('Allow External Users to Create OAuth2 Tokens', 'Off');
    assertDetail('Enable HTTP Basic Auth', 'On');
    assertDetail('Idle Time Force Log Out', '1800 seconds');
    assertDetail('Maximum number of simultaneous logged in sessions', '-1');
  });

  test('should hide edit button from non-superusers', async () => {
    await renderDetail({
      context: { config: { me: { is_superuser: false } } },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    SettingsAPI.readCategory.mockRejectedValue(new Error());
    await renderDetail();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
