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
import UI from './UI';

vi.mock('../../../api/models/Settings');

describe('<UI />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: '',
        CUSTOM_LOGO: '',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderUI(initialEntries: string[], context?: TestContexts) {
    const history = createMemoryHistory({ initialEntries });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route path="/appearance/*" element={<UI />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history }, ...context } }
    );
    return { ...result, history };
  }

  test('should render user interface details', async () => {
    renderUI(['/appearance']);
    expect(await screen.findByText('Default Language')).toBeInTheDocument();
  });

  test('should open the page on its first tab', async () => {
    const { history } = renderUI(['/appearance']);
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/appearance/language')
    );
  });

  test('should send an old ?tab= link to the tab it names', async () => {
    // The tab once lived in the query, and links to those addresses are
    // still about.
    const { history } = renderUI(['/appearance?tab=login']);
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/appearance/login')
    );
    expect(await screen.findByText('Custom Login Info')).toBeInTheDocument();
  });

  test('should render user interface edit', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: '',
        CUSTOM_LOGO: '',
        CUSTOM_TITLE: '',
        CUSTOM_HEADER_LOGO: '',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    renderUI(['/appearance/edit/login']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderUI(['/appearance/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });

  test('should send users without system admin permissions to the details', async () => {
    const { history } = renderUI(['/appearance/edit/theme'], {
      config: { me: { is_superuser: false } },
    });
    // The page, which opens on its first tab.
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/appearance/language')
    );
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });
});
