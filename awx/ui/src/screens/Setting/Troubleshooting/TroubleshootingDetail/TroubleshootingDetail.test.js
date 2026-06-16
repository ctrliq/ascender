import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import mockJobSettings from '../../shared/data.jobSettings.json';
import TroubleshootingDetail from './TroubleshootingDetail';

jest.mock('../../../../api');

describe('<TroubleshootingDetail />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockJobSettings,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderDetail(context) {
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
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
    expect(screen.getByText('Job execution path')).toBeInTheDocument();
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
    assertDetail('Job execution path', '/tmp');
    assertDetail('Run Project Updates With Higher Verbosity', 'Off');
    assertDetail('Enable Role Download', 'On');
    assertDetail('Enable Collection(s) Download', 'On');
    assertDetail('Follow symlinks', 'Off');
    assertDetail('Ignore Ansible Galaxy SSL Certificate Verification', 'Off');
    assertDetail('Maximum Scheduled Jobs', '10');
    assertDetail('Default Job Timeout', '0 seconds');
    assertDetail('Default Job Idle Timeout', '0 seconds');
    assertDetail('Default Inventory Update Timeout', '0 seconds');
    assertDetail('Default Project Update Timeout', '0 seconds');
    assertDetail('Per-Host Ansible Fact Cache Timeout', '0 seconds');
    assertDetail('Maximum number of forks per job', '200');
    assertDetail('Expose host paths for Container Groups', 'Off');
    // CodeEditor renders empty under jsdom; assert the labels are present.
    expect(
      screen.getByText('Ansible Modules Allowed for Ad Hoc Jobs')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Paths to expose to isolated jobs')
    ).toBeInTheDocument();
    expect(screen.getByText('Extra Environment Variables')).toBeInTheDocument();
    expect(screen.getByText('Ansible Callback Plugins')).toBeInTheDocument();
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
    SettingsAPI.readCategory.mockRejectedValue(new Error());
    await renderDetail();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
