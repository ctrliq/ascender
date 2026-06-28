import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockJobSettings from '../shared/data.jobSettings.json';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import mockTroubleshootingSettings from './TroubleshootingEdit/data.defaultTroubleshootingSettings.json';
import Troubleshooting from './Troubleshooting';

jest.mock('../../../api');

describe('<Troubleshooting />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockJobSettings,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderTroubleshooting(initialEntries) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
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
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockTroubleshootingSettings,
    });
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
