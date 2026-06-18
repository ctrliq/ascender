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
import JobsDetail from './JobsDetail';

jest.mock('../../../../api');

// CodeEditor (react-ace) renders empty under jsdom, so for variable details we
// assert the surrounding label is present rather than the editor contents.
function assertVariableDetail(label) {
  expect(screen.getByText(label)).toBeInTheDocument();
}

describe('<JobsDetail />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockJobSettings,
    });
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  async function mountDetail(context) {
    renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <JobsDetail />
      </SettingsProvider>,
      context ? { context } : undefined
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
  }

  test('initially renders without crashing', async () => {
    await mountDetail();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await mountDetail();
    const expectedTabs = ['Back to Settings', 'Details'];
    screen.getAllByRole('tab').forEach((tab, index) => {
      expect(tab).toHaveTextContent(expectedTabs[index]);
    });
  });

  test('should render expected details', async () => {
    await mountDetail();
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
    assertVariableDetail('Ansible Modules Allowed for Ad Hoc Jobs');
    assertVariableDetail('Paths to expose to isolated jobs');
    assertVariableDetail('Extra Environment Variables');
    assertVariableDetail('Ansible Callback Plugins');
  });

  test('should hide edit button from non-superusers', async () => {
    await mountDetail({ config: { me: { is_superuser: false } } });
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    SettingsAPI.readCategory.mockRejectedValue(new Error());
    await mountDetail();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });
});
