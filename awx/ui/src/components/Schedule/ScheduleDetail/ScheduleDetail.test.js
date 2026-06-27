import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'routerCompat';
import { SchedulesAPI, JobTemplatesAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import ScheduleDetail from './ScheduleDetail';

jest.mock('../../../api');

const allPrompts = {
  data: {
    ask_credential_on_launch: true,
    ask_diff_mode_on_launch: true,
    ask_inventory_on_launch: true,
    ask_job_type_on_launch: true,
    ask_limit_on_launch: true,
    ask_scm_branch_on_launch: true,
    ask_skip_tags_on_launch: true,
    ask_tags_on_launch: true,
    ask_variables_on_launch: true,
    ask_verbosity_on_launch: true,
    ask_execution_environment_on_launch: true,
    ask_labels_on_launch: true,
    ask_forks_on_launch: true,
    ask_job_slice_count_on_launch: true,
    ask_timeout_on_launch: true,
    ask_instance_groups_on_launch: true,
    survey_enabled: true,
    inventory_needed_to_start: true,
  },
};

const noPrompts = {
  data: {
    ask_credential_on_launch: false,
    ask_diff_mode_on_launch: false,
    ask_inventory_on_launch: false,
    ask_job_type_on_launch: false,
    ask_limit_on_launch: false,
    ask_scm_branch_on_launch: false,
    ask_skip_tags_on_launch: false,
    ask_tags_on_launch: false,
    ask_variables_on_launch: false,
    ask_verbosity_on_launch: false,
    ask_execution_environment_on_launch: false,
    ask_labels_on_launch: false,
    ask_forks_on_launch: false,
    ask_job_slice_count_on_launch: false,
    ask_timeout_on_launch: false,
    ask_instance_groups_on_launch: false,
    survey_enabled: false,
  },
};

const schedule = {
  url: '/api/v2/schedules/1',
  rrule:
    'DTSTART;TZID=America/New_York:20200220T000000 RRULE:FREQ=DAILY;INTERVAL=1;COUNT=1',
  id: 1,
  summary_fields: {
    unified_job_template: {
      id: 1,
      name: 'Mock JT',
      description: '',
      unified_job_type: 'job',
    },
    user_capabilities: {
      edit: true,
      delete: true,
    },
    created_by: {
      id: 1,
      username: 'admin',
      first_name: '',
      last_name: '',
    },
    modified_by: {
      id: 1,
      username: 'admin',
      first_name: '',
      last_name: '',
    },
  },
  created: '2020-03-03T20:38:54.210306Z',
  modified: '2020-03-03T20:38:54.210336Z',
  name: 'Mock JT Schedule',
  enabled: false,
  description: 'A good schedule',
  timezone: 'America/New_York',
  dtstart: '2020-03-16T04:00:00Z',
  dtend: '2020-07-06T04:00:00Z',
  next_run: '2020-03-16T04:00:00Z',
  extra_data: {},
  inventory: null,
  scm_branch: null,
  job_type: null,
  job_tags: null,
  skip_tags: null,
  limit: null,
  diff_mode: null,
  verbosity: null,
  execution_environment: null,
  forks: null,
  job_slice_count: null,
  timeout: null,
};

const scheduleWithPrompts = {
  ...schedule,
  job_type: 'run',
  inventory: 1,
  job_tags: 'tag1',
  skip_tags: 'tag2',
  scm_branch: 'foo/branch',
  limit: 'localhost',
  diff_mode: true,
  verbosity: 1,
  extra_data: { foo: 'fii' },
  execution_environment: 1,
  forks: 1,
  job_slice_count: 1,
  timeout: 100,
};

function renderDetail(detailSchedule, props = {}) {
  const history = createMemoryHistory({
    initialEntries: ['/templates/job_template/1/schedules/1/details'],
  });
  return renderWithContexts(
    <Routes>
      <Route
        path="/templates/job_template/:id/schedules/:scheduleId/details"
        element={<ScheduleDetail schedule={detailSchedule} {...props} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<ScheduleDetail />', () => {
  beforeEach(() => {
    SchedulesAPI.createPreview.mockResolvedValue({
      data: { local: [], utc: [] },
    });
  });

  test('details should render with the proper values without prompts', async () => {
    SchedulesAPI.readCredentials.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue(noPrompts);
    renderDetail(schedule);
    await screen.findByText('Mock JT Schedule');

    assertDetail('Name', 'Mock JT Schedule');
    assertDetail('Description', 'A good schedule');
    expect(screen.getByText('First Run')).toBeInTheDocument();
    expect(screen.getByText('Next Run')).toBeInTheDocument();
    expect(screen.getByText('Last Run')).toBeInTheDocument();
    assertDetail('Local Time Zone', 'America/New_York');
    expect(screen.getByText('Repeat Frequency')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();

    expect(screen.queryByText('Prompted Values')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Type')).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Source Control Branch')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Verbosity')).not.toBeInTheDocument();
    expect(screen.queryByText('Show Changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Tags')).not.toBeInTheDocument();
    expect(screen.queryByText('Skip Tags')).not.toBeInTheDocument();
    expect(screen.queryByText('Timeout')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Slicing')).not.toBeInTheDocument();
    expect(screen.queryByText('Forks')).not.toBeInTheDocument();
    expect(screen.queryByText('Labels')).not.toBeInTheDocument();
    expect(screen.queryByText('Instance Groups')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Execution Environment')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Variables')).not.toBeInTheDocument();
  });

  test('details should render with the proper values with prompts', async () => {
    SchedulesAPI.readCredentials.mockResolvedValue({
      data: {
        count: 2,
        results: [
          { id: 1, name: 'Cred 1' },
          { id: 2, name: 'Cred 2' },
        ],
      },
    });
    SchedulesAPI.readInstanceGroups.mockResolvedValue({
      data: { count: 1, results: [{ id: 1, name: 'IG 1' }] },
    });
    SchedulesAPI.readAllLabels.mockResolvedValue({
      data: { count: 1, results: [{ id: 1, name: 'Label 1' }] },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue(allPrompts);
    renderDetail(scheduleWithPrompts);
    await screen.findByText('Prompted Values');

    assertDetail('Name', 'Mock JT Schedule');
    assertDetail('Description', 'A good schedule');
    expect(screen.getByText('First Run')).toBeInTheDocument();
    expect(screen.getByText('Next Run')).toBeInTheDocument();
    expect(screen.getByText('Last Run')).toBeInTheDocument();
    assertDetail('Local Time Zone', 'America/New_York');
    expect(screen.getByText('Repeat Frequency')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();

    expect(screen.getByText('Prompted Values')).toBeInTheDocument();
    assertDetail('Job Type', 'run');
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    assertDetail('Source Control Branch', 'foo/branch');
    assertDetail('Limit', 'localhost');
    // The Verbosity detail's value comes from VERBOSITY(t)[verbosity], whose
    // Lingui macro resolves to an empty string under the test i18n setup, so
    // the Detail renders null (no DOM node) even though ask_verbosity_on_launch
    // is true. RTL can only see the (absent) DOM, so we assert the
    // empty-value behavior here. See VerbositySelectField VERBOSITY().
    expect(document.querySelector('#schedule-verbosity')).not.toBeInTheDocument();
    expect(screen.getByText('Show Changes')).toBeInTheDocument();
    expect(screen.getByText('Credentials')).toBeInTheDocument();
    expect(screen.getByText('Job Tags')).toBeInTheDocument();
    expect(screen.getByText('Skip Tags')).toBeInTheDocument();
    expect(screen.getByText('Timeout')).toBeInTheDocument();
    expect(screen.getByText('Job Slicing')).toBeInTheDocument();
    expect(screen.getByText('Forks')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('Instance Groups')).toBeInTheDocument();
    expect(screen.getByText('Execution Environment')).toBeInTheDocument();
    expect(screen.getByText('Variables')).toBeInTheDocument();
  });

  test('prompt values section should be hidden if no overrides are present on the schedule but ask_ options are all true', async () => {
    SchedulesAPI.readCredentials.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    SchedulesAPI.readInstanceGroups.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    SchedulesAPI.readAllLabels.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue(allPrompts);
    renderDetail(schedule);
    await screen.findByText('Mock JT Schedule');

    expect(screen.queryByText('Prompted Values')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Type')).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory')).not.toBeInTheDocument();
    expect(screen.queryByText('Source Control Branch')).not.toBeInTheDocument();
    expect(screen.queryByText('Limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Verbosity')).not.toBeInTheDocument();
    expect(screen.queryByText('Show Changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Tags')).not.toBeInTheDocument();
    expect(screen.queryByText('Skip Tags')).not.toBeInTheDocument();
    expect(screen.queryByText('Variables')).not.toBeInTheDocument();
  });

  test('prompt values section should be hidden if overrides are present on the schedule but ask_ options are all false', async () => {
    SchedulesAPI.readCredentials.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue(noPrompts);
    renderDetail(scheduleWithPrompts);
    await screen.findByText('Mock JT Schedule');

    expect(screen.queryByText('Prompted Values')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Type')).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory')).not.toBeInTheDocument();
    expect(screen.queryByText('Source Control Branch')).not.toBeInTheDocument();
    expect(screen.queryByText('Limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Variables')).not.toBeInTheDocument();
  });

  test('error shown when error encountered fetching credentials', async () => {
    SchedulesAPI.readCredentials.mockRejectedValue(new Error());
    JobTemplatesAPI.readLaunch.mockResolvedValue(noPrompts);
    renderDetail(schedule);

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should show edit button for users with edit permission', async () => {
    SchedulesAPI.readCredentials.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue(noPrompts);
    renderDetail(schedule);

    const editButton = await screen.findByRole('link', { name: 'Edit' });
    expect(editButton).toHaveTextContent('Edit');
    expect(editButton.getAttribute('href')).toMatch(
      /\/templates\/job_template\/1\/schedules\/1\/edit$/
    );
  });

  test('Error dialog shown for failed deletion', async () => {
    SchedulesAPI.destroy.mockRejectedValueOnce(new Error());
    SchedulesAPI.readCredentials.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue(noPrompts);
    const { user } = renderDetail(schedule);
    await screen.findByText('Mock JT Schedule');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    expect(SchedulesAPI.destroy).toHaveBeenCalledTimes(1);
  });

  test('should have disabled toggle', async () => {
    SchedulesAPI.readCredentials.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    SchedulesAPI.readInstanceGroups.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    SchedulesAPI.readAllLabels.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue(allPrompts);
    renderDetail(schedule, { surveyConfig: { spec: [] } });
    await screen.findByText('Mock JT Schedule');

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Toggle schedule' })
      ).toBeDisabled()
    );
  });

  test('should display warning for unsupported recurrence rules', async () => {
    const unsupportedSchedule = {
      ...schedule,
      rrule:
        'DTSTART:20221220T161500Z RRULE:FREQ=HOURLY;INTERVAL=1 EXRULE:FREQ=HOURLY;INTERVAL=1;BYDAY=TU;BYMONTHDAY=1,2,3,4,5,6,7 EXRULE:FREQ=HOURLY;INTERVAL=1;BYDAY=WE;BYMONTHDAY=2,3,4,5,6,7,8',
    };
    SchedulesAPI.readCredentials.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue(noPrompts);
    renderDetail(unsupportedSchedule);

    expect(
      await screen.findByText(/complex rules that are not supported/i)
    ).toBeInTheDocument();
  });
});
