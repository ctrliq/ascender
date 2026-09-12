import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import GoogleOAuth2 from './GoogleOAuth2';

vi.mock('../../../api');

const mockSettings = {
  SOCIAL_AUTH_GOOGLE_OAUTH2_CALLBACK_URL:
    'https://towerhost/sso/complete/google-oauth2/',
  SOCIAL_AUTH_GOOGLE_OAUTH2_KEY: 'mock key',
  SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET: '$encrypted$',
  SOCIAL_AUTH_GOOGLE_OAUTH2_WHITELISTED_DOMAINS: [
    'example.com',
    'example_2.com',
  ],
  SOCIAL_AUTH_GOOGLE_OAUTH2_AUTH_EXTRA_ARGUMENTS: {},
  SOCIAL_AUTH_GOOGLE_OAUTH2_ORGANIZATION_MAP: { Default: {} },
  SOCIAL_AUTH_GOOGLE_OAUTH2_TEAM_MAP: {},
};

function mountAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <SettingsProvider value={JSON.parse(JSON.stringify(settingOptions))}>
      <Routes>
        <Route path="/settings/google_oauth2/*" element={<GoogleOAuth2 />} />
      </Routes>
    </SettingsProvider>,
    { context: { router: { history } } }
  );
}

describe('<GoogleOAuth2 />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render Google OAuth 2.0 details', async () => {
    mountAt('/settings/google_oauth2/details');
    expect(
      await screen.findByText('Google OAuth2 Callback URL')
    ).toBeInTheDocument();
  });

  test('should render Google OAuth 2.0 edit', async () => {
    mountAt('/settings/google_oauth2/edit');
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    mountAt('/settings/google_oauth2/foo');
    expect(
      await screen.findByText('View Google OAuth 2.0 settings')
    ).toBeInTheDocument();
  });
});
