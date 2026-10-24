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
import mockAllSettings from '../shared/data.allSettings.json';
import MiscAuthentication from './MiscAuthentication';

vi.mock('../../../api');

describe('<MiscAuthentication />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockAllSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderMiscAuthentication(
    initialEntries: string[],
    context?: TestContexts
  ) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route
            path="/authentication/session/*"
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
    renderMiscAuthentication(['/authentication/session/details']);
    expect(
      await screen.findByText('Disable the built-in authentication system')
    ).toBeInTheDocument();
  });

  test('should render miscellaneous authentication edit', async () => {
    renderMiscAuthentication(['/authentication/session/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderMiscAuthentication(['/authentication/session/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });

  test('should redirect to details for users without system admin permissions', async () => {
    renderMiscAuthentication(['/authentication/session/edit'], {
      config: { me: { is_superuser: false } },
    });
    expect(
      await screen.findByText('Disable the built-in authentication system')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });
});
