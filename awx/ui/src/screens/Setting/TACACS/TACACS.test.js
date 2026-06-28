import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import TACACS from './TACACS';

jest.mock('../../../api/models/Settings');

describe('<TACACS />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        TACACSPLUS_HOST: 'mockhost',
        TACACSPLUS_PORT: 49,
        TACACSPLUS_SECRET: '$encrypted$',
        TACACSPLUS_SESSION_TIMEOUT: 5,
        TACACSPLUS_AUTH_PROTOCOL: 'ascii',
        TACACSPLUS_REM_ADDR: false,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderTACACS(initialEntries) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/tacacs/*" element={<TACACS />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render TACACS+ details', async () => {
    renderTACACS(['/settings/tacacs/details']);
    expect(await screen.findByText('TACACS+ Server')).toBeInTheDocument();
  });

  test('should render TACACS+ edit', async () => {
    renderTACACS(['/settings/tacacs/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderTACACS(['/settings/tacacs/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
