import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { TestContexts } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import mockLDAP from '../shared/data.ldapSettings.json';
import LDAP from './LDAP';

vi.mock('../../../api');

describe('<LDAP />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockLDAP,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderLDAP(initialEntries: string[], context?: TestContexts) {
    const history = createMemoryHistory({ initialEntries });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route path="/authentication/ldap/*" element={<LDAP />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history }, ...context } }
    );
    return { ...result, history };
  }

  test('should render ldap details', async () => {
    renderLDAP(['/authentication/ldap/default/details']);
    expect(await screen.findByText('LDAP Server URI')).toBeInTheDocument();
  });

  test('should render ldap edit', async () => {
    renderLDAP(['/authentication/ldap/default/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderLDAP(['/authentication/ldap/foo/bar']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });

  test('should send users without system admin permissions to the details', async () => {
    const { history } = renderLDAP(['/authentication/ldap/2/edit'], {
      config: { me: { is_superuser: false } },
    });
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/authentication/ldap/2/details'
      )
    );
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });
});
