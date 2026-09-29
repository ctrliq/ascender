import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import type { RenderWithContextsOptions } from '../../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import mockTroubleshootingSettings from '../TroubleshootingEdit/data.defaultTroubleshootingSettings.json';
import TroubleshootingDetail from './TroubleshootingDetail';

vi.mock('../../../../api');

describe('<TroubleshootingDetail />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockTroubleshootingSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderDetail(context?: RenderWithContextsOptions) {
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <TroubleshootingDetail />
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
      screen.getByText('Enable or Disable tmp dir cleanup')
    ).toBeInTheDocument();
  });

  test('should render expected details', async () => {
    await renderDetail();
    assertDetail('Enable or Disable tmp dir cleanup', 'Off');
    assertDetail('Debug Web Requests', 'Off');
    assertDetail('Release Receptor Work', 'Off');
  });

  test('should leave out a tab bar that would hold a single tab', async () => {
    await renderDetail();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
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
