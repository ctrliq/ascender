import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import mockLDAP from '../shared/data.ldapSettings.json';
import LDAP from './LDAP';

jest.mock('../../../api');

describe('<LDAP />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({ data: mockLDAP });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderLDAP(initialEntries) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/ldap/*" element={<LDAP />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render ldap details', async () => {
    renderLDAP(['/settings/ldap/default/details']);
    expect(
      await screen.findByText('LDAP Server URI')
    ).toBeInTheDocument();
  });

  test('should render ldap edit', async () => {
    renderLDAP(['/settings/ldap/default/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderLDAP(['/settings/ldap/foo/bar']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
