import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import type { TestContexts } from '../../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import mockJobSettings from '../../shared/data.jobSettings.json';
import JobsDetail from './JobsDetail';

vi.mock('../../../../api');

// A variable detail is asserted by its surrounding label: what each editor
// holds is covered by the VariablesDetail tests rather than repeated here.
function assertVariableDetail(label: string) {
  expect(screen.getByText(label)).toBeInTheDocument();
}

describe('<JobsDetail />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockJobSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  // Each group of settings is an address, so the screen is mounted on one and
  // shows that group.
  async function mountDetail(group = 'execution', context?: TestContexts) {
    const history = createMemoryHistory({
      initialEntries: [`/job_settings/${group}`],
    });
    renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route path="/job_settings/:group" element={<JobsDetail />} />
        </Routes>
      </SettingsProvider>,
      {
        ...(context ?? {}),
        context: { ...(context ?? {}), router: { history } },
      } as Parameters<typeof renderWithContexts>[1]
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
  }

  test('initially renders without crashing', async () => {
    await mountDetail();
    expect(screen.getByText('Job execution path')).toBeInTheDocument();
  });

  test("should render each tab's settings, and only those", async () => {
    await mountDetail('timeouts');
    assertDetail('Default Job Timeout', '0 seconds');
    assertDetail('Default Job Idle Timeout', '0 seconds');
    assertDetail('Default Inventory Update Timeout', '0 seconds');
    assertDetail('Default Project Update Timeout', '0 seconds');
    assertDetail('Per-Host Ansible Fact Cache Timeout', '0 seconds');
    expect(screen.queryByText('Job execution path')).not.toBeInTheDocument();
  });

  test('should render the limits tab', async () => {
    await mountDetail('limits');
    assertDetail('Maximum Scheduled Jobs', '10');
    assertDetail('Maximum number of forks per job', '200');
  });

  test('should render the execution tab', async () => {
    await mountDetail('execution');
    assertDetail('Job execution path', '/tmp');
    assertDetail('Expose host paths for Container Groups', 'Off');
    assertVariableDetail('Paths to expose to isolated jobs');
    assertVariableDetail('Extra Environment Variables');
    assertVariableDetail('Ansible Callback Plugins');
  });

  test('should render the content tab', async () => {
    await mountDetail('content');
    assertDetail('Enable Role Download', 'On');
    assertDetail('Enable Collection(s) Download', 'On');
    assertDetail('Ignore Ansible Galaxy SSL Certificate Verification', 'Off');
  });

  test('should render the miscellaneous tab', async () => {
    await mountDetail('misc');
    assertDetail('Run Project Updates With Higher Verbosity', 'Off');
    // A choice reads as its label, and 'template' as the edit form words it,
    // rather than as the value stored.
    assertDetail(
      'When can extra variables contain Jinja templates?',
      'Template'
    );
    assertDetail('Follow symlinks', 'Off');
    assertVariableDetail('Ansible Modules Allowed for Ad Hoc Jobs');
  });

  test('should hide edit button from non-superusers', async () => {
    await mountDetail('execution', { config: { me: { is_superuser: false } } });
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    vi.mocked(SettingsAPI.readCategory).mockRejectedValue(new Error());
    await mountDetail();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });
});
