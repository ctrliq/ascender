import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import UI from './UI';

vi.mock('../../../api/models/Settings');

describe('<UI />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: '',
        CUSTOM_LOGO: '',
        PENDO_TRACKING_STATE: 'off',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderUI(initialEntries: string[]) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={settingOptions}>
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
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: '',
        CUSTOM_LOGO: '',
        CUSTOM_TITLE: '',
        CUSTOM_HEADER_LOGO: '',
        PENDO_TRACKING_STATE: 'off',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
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
