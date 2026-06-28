import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import mockAllSettings from '../shared/data.allSettings.json';
import MiscAuthentication from './MiscAuthentication';

jest.mock('../../../api');

describe('<MiscAuthentication />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockAllSettings,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderMiscAuthentication(initialEntries, context) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route
            path="/settings/miscellaneous_authentication/*"
            element={<MiscAuthentication />}
          />
        </Routes>
      </SettingsProvider>,
      {
        context: {
          router: { history },
          ...context,
        },
      }
    );
  }

  test('should render miscellaneous authentication details', async () => {
    renderMiscAuthentication(['/settings/miscellaneous_authentication/details']);
    expect(await screen.findByText('Details')).toBeInTheDocument();
  });

  test('should render miscellaneous authentication edit', async () => {
    renderMiscAuthentication(['/settings/miscellaneous_authentication/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderMiscAuthentication(['/settings/miscellaneous_authentication/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });

  test('should redirect to details for users without system admin permissions', async () => {
    renderMiscAuthentication(['/settings/miscellaneous_authentication/edit'], {
      config: { me: { is_superuser: false } },
    });
    expect(await screen.findByText('Details')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
