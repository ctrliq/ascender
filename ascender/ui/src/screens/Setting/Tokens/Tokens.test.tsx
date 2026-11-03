import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  assertDetail,
  renderWithContexts,
} from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import Tokens from './Tokens';

vi.mock('../../../api');

/** The authentication category, as much of it as this tab reads. */
const mockAuthentication = {
  SESSION_COOKIE_AGE: 1800,
  OAUTH2_PROVIDER: {
    ACCESS_TOKEN_EXPIRE_SECONDS: 31536000000,
    REFRESH_TOKEN_EXPIRE_SECONDS: 2628000,
    AUTHORIZATION_CODE_EXPIRE_SECONDS: 600,
  },
  ALLOW_OAUTH2_FOR_EXTERNAL_USERS: false,
};

describe('<Tokens />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockAuthentication,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderTokens(initialEntries: string[]) {
    const history = createMemoryHistory({ initialEntries });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route path="/authentication/tokens/*" element={<Tokens />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    return { ...result, history };
  }

  /*
   * The three expirations are fields of one nested setting the api labels
   * OAuth 2 Timeout Settings, which a detail would draw as a block of json.
   */
  test('should read the three expirations as three numbers', async () => {
    renderTokens(['/authentication/tokens/details']);
    await screen.findByText('Access Token Expiration');

    assertDetail(
      'Access Token Expiration',
      '1,000 years (31,536,000,000 seconds)'
    );
    assertDetail('Refresh Token Expiration', '1 month (2,628,000 seconds)');
    assertDetail('Authorization Code Expiration', '10 minutes (600 seconds)');
    assertDetail('Allow External Users to Create OAuth2 Tokens', 'Off');
    expect(
      screen.queryByText('OAuth 2 Timeout Settings')
    ).not.toBeInTheDocument();
  });

  test('should sit under the authentication tabs', async () => {
    renderTokens(['/authentication/tokens/details']);
    await screen.findByText('Access Token Expiration');

    ['Providers', 'Session', 'Password', 'Tokens', 'Mapping'].forEach((tab) =>
      expect(screen.getByRole('tab', { name: tab })).toBeVisible()
    );
  });

  test('should land the tab itself on its details', async () => {
    renderTokens(['/authentication/tokens']);
    expect(
      await screen.findByText('Access Token Expiration')
    ).toBeInTheDocument();
  });

  /* The api takes the three as one object, so the form puts them back. */
  test('should save the expirations as the nested setting they are', async () => {
    const { user } = renderTokens(['/authentication/tokens/edit']);
    await screen.findByRole('button', { name: 'Save' });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      ALLOW_OAUTH2_FOR_EXTERNAL_USERS: false,
      OAUTH2_PROVIDER: mockAuthentication.OAUTH2_PROVIDER,
    });
  });

  test('should show content error on an address of its own that is not there', async () => {
    renderTokens(['/authentication/tokens/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
