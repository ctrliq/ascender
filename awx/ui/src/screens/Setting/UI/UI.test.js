import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import UI from './UI';

jest.mock('../../../api/models/Settings');

describe('<UI />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: '',
        CUSTOM_LOGO: '',
        PENDO_TRACKING_STATE: 'off',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderUI(initialEntries) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/ui/*" element={<UI />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render user interface details', async () => {
    renderUI(['/settings/ui/details']);
    expect(
      await screen.findByText('User Analytics Tracking State')
    ).toBeInTheDocument();
  });

  test('should render user interface edit', async () => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: '',
        CUSTOM_LOGO: '',
        CUSTOM_TITLE: '',
        CUSTOM_HEADER_LOGO: '',
        PENDO_TRACKING_STATE: 'off',
      },
    });
    renderUI(['/settings/ui/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderUI(['/settings/ui/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
