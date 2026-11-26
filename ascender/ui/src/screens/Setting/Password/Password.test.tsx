import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import Password from './Password';

vi.mock('../../../api');

/** The authentication category, as much of it as this tab reads. */
const mockAuthentication = {
  SESSION_COOKIE_AGE: 1800,
  LOCAL_PASSWORD_MIN_LENGTH: 8,
  LOCAL_PASSWORD_MIN_DIGITS: 1,
  LOCAL_PASSWORD_MIN_UPPER: 2,
  LOCAL_PASSWORD_MIN_SPECIAL: 3,
};

describe('<Password />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockAuthentication,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderPassword(initialEntries: string[]) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route path="/authentication/password/*" element={<Password />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render the password rules and nothing else of the category', async () => {
    renderPassword(['/authentication/password/details']);

    expect(
      await screen.findByText('Minimum number of characters in local password')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Minimum number of digit characters in local password')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Minimum number of uppercase characters in local password'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Minimum number of special characters in local password')
    ).toBeInTheDocument();
    // The session settings are the other tab's.
    expect(
      screen.queryByText('Idle Time Force Log Out')
    ).not.toBeInTheDocument();
  });

  test('should sit under the authentication tabs', async () => {
    renderPassword(['/authentication/password/details']);
    await screen.findByText('Minimum number of characters in local password');

    ['Providers', 'Session', 'Password'].forEach((tab) =>
      expect(screen.getByRole('tab', { name: tab })).toBeVisible()
    );
  });

  test('should land the tab itself on its details', async () => {
    renderPassword(['/authentication/password']);

    expect(
      await screen.findByText('Minimum number of characters in local password')
    ).toBeInTheDocument();
  });

  test('should render the edit form', async () => {
    renderPassword(['/authentication/password/edit']);

    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', {
        name: /Minimum number of characters in local password/,
      })
    ).toHaveValue(8);
  });

  test('should show content error on an address of its own that is not there', async () => {
    renderPassword(['/authentication/password/foo']);

    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
