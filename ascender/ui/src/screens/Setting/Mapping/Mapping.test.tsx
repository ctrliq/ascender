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
import Mapping from './Mapping';

vi.mock('../../../api');

/** The authentication category, as much of it as this tab reads. */
const mockAuthentication = {
  SESSION_COOKIE_AGE: 1800,
  SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL: false,
  AUTHENTICATION_BACKENDS: ['ascender.main.backends.AscenderModelBackend'],
  SOCIAL_AUTH_ORGANIZATION_MAP: null,
  SOCIAL_AUTH_TEAM_MAP: null,
  SOCIAL_AUTH_USER_FIELDS: null,
};

describe('<Mapping />', () => {
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

  function renderMapping(initialEntries: string[]) {
    const history = createMemoryHistory({ initialEntries });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route path="/authentication/mapping/*" element={<Mapping />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    return { ...result, history };
  }

  test('should render what a provider answer becomes, and nothing else', async () => {
    renderMapping(['/authentication/mapping/details']);
    await screen.findByText('Use Email address for usernames');

    assertDetail('Use Email address for usernames', 'Off');
    // CodeEditor renders empty under jsdom; assert the labels are there.
    [
      'Authentication Backends',
      'Social Auth Organization Map',
      'Social Auth Team Map',
      'Social Auth User Fields',
    ].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
    expect(
      screen.queryByText('Idle Time Force Log Out')
    ).not.toBeInTheDocument();
  });

  test('should sit under the authentication tabs', async () => {
    renderMapping(['/authentication/mapping/details']);
    await screen.findByText('Use Email address for usernames');

    // Providers first, where the screen opens, and the rest by name.
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Providers',
      'Mapping',
      'Password',
      'Session',
      'Tokens',
    ]);
  });

  test('should land the tab itself on its details', async () => {
    renderMapping(['/authentication/mapping']);
    expect(
      await screen.findByText('Use Email address for usernames')
    ).toBeInTheDocument();
  });

  /* Authentication Backends is read only, so the form has no field for it. */
  test('should save its own settings without the read only one', async () => {
    const { user } = renderMapping(['/authentication/mapping/edit']);
    await screen.findByRole('button', { name: 'Save' });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(SettingsAPI.updateAll).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(sent).sort()).toEqual([
      'SOCIAL_AUTH_ORGANIZATION_MAP',
      'SOCIAL_AUTH_TEAM_MAP',
      'SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL',
      'SOCIAL_AUTH_USER_FIELDS',
    ]);
  });

  test('should show content error on an address of its own that is not there', async () => {
    renderMapping(['/authentication/mapping/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
