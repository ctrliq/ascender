import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import type { RenderWithContextsOptions } from '../../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import UIDetail from './UIDetail';

vi.mock('../../../../api');

describe('<UIDetail />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: 'mock info',
        CUSTOM_LOGO: 'data:image/png',
        CUSTOM_THEME: 'html[data-theme="custom"] { --x: #fff; }',
        CUSTOM_THEME_NAME: 'Mock Theme',
        DEFAULT_UI_THEME: 'default',
        DEFAULT_UI_LANGUAGE: '',
        UI_LIVE_UPDATES_ENABLED: true,
        MAX_UI_JOB_EVENTS: 4000,
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderDetail(context?: RenderWithContextsOptions) {
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <UIDetail />
      </SettingsProvider>,
      context
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderDetail();
    expect(screen.getByText('Default Language')).toBeInTheDocument();
  });

  test('should render one tab per group of settings', async () => {
    await renderDetail();
    ['Language', 'Login', 'Logo', 'Miscellaneous', 'Theme', 'Title'].forEach(
      (name) => {
        expect(screen.getByRole('tab', { name })).toBeInTheDocument();
      }
    );
  });

  test("should render each tab's settings, and only those", async () => {
    const { user } = await renderDetail();

    expect(screen.queryByText('Custom Login Info')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Login' }));
    assertDetail('Custom Login Info', 'mock info');
    const logoLabel = screen.getByText('Custom Login Logo');
    const logoValue = logoLabel.nextElementSibling;
    expect(
      within(logoValue as unknown as HTMLElement).getByRole('img')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Theme' }));
    expect(screen.getByText('Custom Theme CSS File')).toBeInTheDocument();
  });

  test('should open on the tab the address names', async () => {
    // Where the edit form sends a reader back to after a save or a cancel.
    const history = createMemoryHistory({
      initialEntries: ['/appearance/theme'],
    });
    await renderDetail({ context: { router: { history } } });
    expect(screen.getByText('Custom Theme Name')).toBeInTheDocument();
    expect(screen.queryByText('Default Language')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/appearance/edit/theme'
    );
  });

  test('should hide edit button from non-superusers', async () => {
    await renderDetail({
      context: { config: { me: { is_superuser: false } } },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    vi.mocked(SettingsAPI.readCategory).mockRejectedValue(new Error());
    await renderDetail();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
