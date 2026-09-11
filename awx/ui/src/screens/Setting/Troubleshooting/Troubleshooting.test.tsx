import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockJobSettings from '../shared/data.jobSettings.json';
import { settingOptions } from '../../../../testUtils/settingOptions';
import mockTroubleshootingSettings from './TroubleshootingEdit/data.defaultTroubleshootingSettings.json';
import Troubleshooting from './Troubleshooting';

vi.mock('../../../api');

describe('<Troubleshooting />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockJobSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderTroubleshooting(initialEntries: Untyped) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route
            path="/settings/troubleshooting/*"
            element={<Troubleshooting />}
          />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render troubleshooting details', async () => {
    renderTroubleshooting(['/settings/troubleshooting/details']);
    expect(await screen.findByText('Job execution path')).toBeInTheDocument();
  });

  test('should render troubleshooting edit', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockTroubleshootingSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    renderTroubleshooting(['/settings/troubleshooting/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderTroubleshooting(['/settings/troubleshooting/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
