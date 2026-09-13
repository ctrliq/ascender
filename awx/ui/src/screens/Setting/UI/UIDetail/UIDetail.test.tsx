import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
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
        PENDO_TRACKING_STATE: 'off',
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
    expect(
      screen.getByText('User Analytics Tracking State')
    ).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await renderDetail();
    expect(
      screen.getAllByRole('tab', { name: /Back to Settings/ }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('tab', { name: /Details/ }).length
    ).toBeGreaterThan(0);
  });

  test('should render expected details', async () => {
    await renderDetail();
    assertDetail('User Analytics Tracking State', 'off');
    assertDetail('Custom Login Info', 'mock info');
    const logoLabel = screen.getByText('Custom Login Logo');
    const logoValue = logoLabel.nextElementSibling;
    expect(
      within(logoValue as unknown as HTMLElement).getByRole('img')
    ).toBeInTheDocument();
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
