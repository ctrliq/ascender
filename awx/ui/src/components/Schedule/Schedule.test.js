import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { JobTemplatesAPI, SchedulesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Schedule from './Schedule';

jest.mock('../../api/models/JobTemplates');
jest.mock('../../api/models/Schedules');
jest.mock('../../api/models/WorkflowJobTemplates');

const unifiedJobTemplate = { id: 1, name: 'Mock JT' };

beforeEach(() => {
  SchedulesAPI.readDetail.mockResolvedValue({
    data: {
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
      next_run: '2020-02-20T05:00:00Z',
    },
  });

  SchedulesAPI.createPreview.mockResolvedValue({
    data: { local: [], utc: [] },
  });

  SchedulesAPI.readCredentials.mockResolvedValue({
    data: { count: 0, results: [] },
  });

  JobTemplatesAPI.readLaunch.mockResolvedValue({
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
      survey_enabled: false,
    },
  });
});

function renderSchedule() {
  const history = createMemoryHistory({
    initialEntries: ['/templates/job_template/1/schedules/1/details'],
  });
  // Mount under the same ":scheduleId/*" route that Schedules.js provides, at a
  // concrete URL, so the nested v6 <Routes> resolve and useParams sees the id.
  return renderWithContexts(
    <Routes>
      <Route
        path="/templates/job_template/:id/schedules/:scheduleId/*"
        element={
          <Schedule setBreadcrumb={() => {}} resource={unifiedJobTemplate} />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Schedule />', () => {
  test('renders successfully', async () => {
    renderSchedule();
    expect(
      await screen.findByRole('tab', { name: 'Details' })
    ).toBeInTheDocument();
  });

  test('expect all tabs to exist, including Back to Schedules', async () => {
    renderSchedule();
    expect(
      await screen.findByRole('tab', { name: /Back to Schedules/ })
    ).toBeInTheDocument();

    const backTab = screen.getByRole('tab', { name: /Back to Schedules/ });
    const backLink =
      backTab.tagName === 'A' ? backTab : backTab.querySelector('a');
    // Link renders an href the router resolves to .../schedules
    expect(backLink.getAttribute('href')).toMatch(
      /\/templates\/job_template\/1\/schedules$/
    );
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument();
  });
});
