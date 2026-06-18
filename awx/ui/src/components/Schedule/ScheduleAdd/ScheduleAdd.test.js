import React from 'react';
import { act, waitFor } from '@testing-library/react';
import { RRule } from 'rrule';
import {
  CredentialsAPI,
  CredentialTypesAPI,
  SchedulesAPI,
  JobTemplatesAPI,
  InventoriesAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ScheduleAdd from './ScheduleAdd';

jest.mock('../../../api/models/Credentials');
jest.mock('../../../api/models/CredentialTypes');
jest.mock('../../../api/models/Schedules');
jest.mock('../../../api/models/JobTemplates');
jest.mock('../../../api/models/Inventories');

// The multi-section/prompt-wizard form is exercised by ScheduleForm's own
// suite. Here we mock it so we can drive ScheduleAdd's handleSubmit directly
// (the original suite invoked the Formik onSubmit, which simply forwards the
// form values + launchConfig/surveyConfig to that handleSubmit).
let formProps;
jest.mock('../shared/ScheduleForm', () => {
  const MockScheduleForm = (props) => {
    formProps = props;
    return <div data-testid="schedule-form" />;
  };
  return MockScheduleForm;
});

const launchConfig = {
  can_start_without_user_input: false,
  passwords_needed_to_start: [],
  ask_scm_branch_on_launch: false,
  ask_variables_on_launch: false,
  ask_tags_on_launch: false,
  ask_diff_mode_on_launch: false,
  ask_skip_tags_on_launch: false,
  ask_job_type_on_launch: false,
  ask_limit_on_launch: false,
  ask_verbosity_on_launch: false,
  ask_inventory_on_launch: true,
  ask_credential_on_launch: true,
  survey_enabled: false,
  variables_needed_to_start: [],
  credential_needed_to_start: false,
  inventory_needed_to_start: true,
  job_template_data: {
    name: 'Demo Job Template',
    id: 7,
    description: '',
  },
  defaults: {
    extra_vars: '---',
    diff_mode: false,
    limit: '',
    job_tags: '',
    skip_tags: '',
    job_type: 'run',
    verbosity: 0,
    inventory: { name: null, id: null },
    scm_branch: '',
  },
};

const resource = {
  id: 700,
  type: 'job_template',
  inventory: 2,
  summary_fields: { credentials: [] },
  name: 'Foo Job Template',
  description: '',
};

function submit(values) {
  // mirror ScheduleForm's onSubmit, which forwards the launch/survey config.
  // handleSubmit navigates on success, which updates the router; wrap in act so
  // that state update is flushed inside the test.
  return act(() =>
    formProps.handleSubmit(
      values,
      formProps.launchConfig,
      formProps.surveyConfig
    )
  );
}

function renderAdd(props = {}) {
  return renderWithContexts(
    <ScheduleAdd
      apiModel={JobTemplatesAPI}
      resource={resource}
      launchConfig={launchConfig}
      surveyConfig={{}}
      {...props}
    />
  );
}

describe('<ScheduleAdd />', () => {
  beforeEach(() => {
    // resetMocks clears the captured props between tests; reset formProps so a
    // test waits for the current render rather than seeing the previous one.
    formProps = undefined;
    SchedulesAPI.readZoneInfo.mockResolvedValue({
      data: [{ name: 'America/New_York' }],
    });
    JobTemplatesAPI.createSchedule.mockResolvedValue({ data: { id: 3 } });
    CredentialTypesAPI.loadAllTypes.mockResolvedValue([
      { id: 1, name: 'ssh', kind: 'ssh' },
    ]);
    CredentialsAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [
          { id: 10, name: 'cred 1', kind: 'ssh', url: '', credential_type: 1 },
        ],
      },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: {
        related_search_fields: [],
        actions: { GET: { filterabled: true } },
      },
    });
  });

  test('Successfully creates a schedule with repeat frequency: None (run once)', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: [],
      name: 'Run once schedule',
      startDate: '2020-03-25',
      startTime: '10:00 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Run once schedule',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200325T100000 RRULE:INTERVAL=1;COUNT=1;FREQ=MINUTELY',
    });
  });

  test('Successfully creates a schedule with 10 minute repeat frequency and 10 occurrences', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['minute'],
      frequencyOptions: {
        minute: { end: 'after', interval: 10, occurrences: 10 },
      },
      name: 'Run every 10 minutes 10 times',
      startDate: '2020-03-25',
      startTime: '10:30 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Run every 10 minutes 10 times',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200325T103000 RRULE:INTERVAL=10;FREQ=MINUTELY;COUNT=10',
    });
  });

  test('Successfully creates a schedule with hourly repeat frequency ending on a specific date/time', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['hour'],
      frequencyOptions: {
        hour: {
          end: 'onDate',
          interval: 1,
          endDate: '2020-03-26',
          endTime: '10:45 AM',
        },
      },
      name: 'Run every hour until date',
      startDate: '2020-03-25',
      startTime: '10:45 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Run every hour until date',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200325T104500 RRULE:INTERVAL=1;FREQ=HOURLY;UNTIL=20200326T144500Z',
    });
  });

  test('Successfully creates a schedule with daily repeat frequency', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['day'],
      frequencyOptions: { day: { end: 'never', interval: 1 } },
      name: 'Run daily',
      startDate: '2020-03-25',
      startTime: '10:45 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Run daily',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200325T104500 RRULE:INTERVAL=1;FREQ=DAILY',
    });
  });

  test('Successfully creates a schedule with weekly repeat frequency on mon/wed/fri', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['week'],
      frequencyOptions: {
        week: {
          end: 'never',
          interval: 1,
          occurrences: 1,
          daysOfWeek: [RRule.MO, RRule.WE, RRule.FR],
        },
      },
      name: 'Run weekly on mon/wed/fri',
      startDate: '2020-03-25',
      startTime: '10:45 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Run weekly on mon/wed/fri',
      extra_data: {},
      rrule: `DTSTART;TZID=America/New_York:20200325T104500 RRULE:INTERVAL=1;FREQ=WEEKLY;BYDAY=${RRule.MO},${RRule.WE},${RRule.FR}`,
    });
  });

  test('Successfully creates a schedule with monthly repeat frequency on the first day of the month', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['month'],
      frequencyOptions: {
        month: {
          end: 'never',
          occurrences: 1,
          interval: 1,
          runOn: 'day',
          runOnDayNumber: 1,
        },
      },
      name: 'Run on the first day of the month',
      startTime: '10:45 AM',
      startDate: '2020-04-01',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Run on the first day of the month',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200401T104500 RRULE:INTERVAL=1;FREQ=MONTHLY;BYMONTHDAY=1',
    });
  });

  test('Successfully creates a schedule with monthly repeat frequency on the last tuesday of the month', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['month'],
      frequencyOptions: {
        month: {
          end: 'never',
          endDate: '2020-03-26',
          endTime: '11:00 AM',
          interval: 1,
          occurrences: 1,
          runOn: 'the',
          runOnTheDay: 'tuesday',
          runOnTheOccurrence: -1,
        },
      },
      name: 'Run monthly on the last Tuesday',
      startDate: '2020-03-31',
      startTime: '11:00 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Run monthly on the last Tuesday',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200331T110000 RRULE:INTERVAL=1;FREQ=MONTHLY;BYSETPOS=-1;BYDAY=TU',
    });
  });

  test('Successfully creates a schedule with yearly repeat frequency on the first day of March', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['year'],
      frequencyOptions: {
        year: {
          end: 'never',
          interval: 1,
          occurrences: 1,
          runOn: 'day',
          runOnDayMonth: 3,
          runOnDayNumber: 1,
        },
      },
      name: 'Yearly on the first day of March',
      startDate: '2020-03-01',
      startTime: '12:00 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Yearly on the first day of March',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200301T000000 RRULE:INTERVAL=1;FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=1',
    });
  });

  test('Successfully creates a schedule with yearly repeat frequency on the second Friday in April', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['year'],
      frequencyOptions: {
        year: {
          end: 'never',
          interval: 1,
          occurrences: 1,
          runOn: 'the',
          runOnTheOccurrence: 2,
          runOnTheDay: 'friday',
          runOnTheMonth: 4,
        },
      },
      name: 'Yearly on the second Friday in April',
      startDate: '2020-04-10',
      startTime: '11:15 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Yearly on the second Friday in April',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200410T111500 RRULE:INTERVAL=1;FREQ=YEARLY;BYSETPOS=2;BYDAY=FR;BYMONTH=4',
    });
  });

  test('Successfully creates a schedule with yearly repeat frequency on the first weekday in October', async () => {
    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: ['year'],
      frequencyOptions: {
        year: {
          end: 'never',
          interval: 1,
          occurrences: 1,
          runOn: 'the',
          runOnTheOccurrence: 1,
          runOnTheDay: 'weekday',
          runOnTheMonth: 10,
        },
      },
      name: 'Yearly on the first weekday in October',
      startDate: '2020-04-10',
      startTime: '11:15 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Yearly on the first weekday in October',
      extra_data: {},
      rrule:
        'DTSTART;TZID=America/New_York:20200410T111500 RRULE:INTERVAL=1;FREQ=YEARLY;BYSETPOS=1;BYDAY=MO,TU,WE,TH,FR;BYMONTH=10',
    });
  });

  test('should submit prompted data properly', async () => {
    InventoriesAPI.read.mockResolvedValue({
      data: {
        count: 2,
        results: [
          { name: 'Foo', id: 1, url: '' },
          { name: 'Bar', id: 2, url: '' },
        ],
      },
    });
    InventoriesAPI.readOptions.mockResolvedValue({
      data: {
        related_search_fields: [],
        actions: { GET: { filterable: true } },
      },
    });
    SchedulesAPI.associateCredential.mockResolvedValue({});

    renderAdd();
    await waitFor(() => expect(formProps).toBeDefined());

    // The prompt wizard lives inside ScheduleForm; here we submit the values it
    // would have produced (inventory chosen + credential 10 added).
    await submit({
      name: 'Schedule',
      frequency: [],
      skip_tags: '',
      inventory: { name: 'inventory', id: 45 },
      credentials: [{ name: 'cred 1', id: 10 }],
      startDate: '2021-01-28',
      startTime: '2:15 PM',
      timezone: 'America/New_York',
    });

    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      extra_data: {},
      inventory: 45,
      name: 'Schedule',
      rrule:
        'DTSTART;TZID=America/New_York:20210128T141500 RRULE:INTERVAL=1;COUNT=1;FREQ=MINUTELY',
      skip_tags: '',
    });
    await waitFor(() =>
      expect(SchedulesAPI.associateCredential).toHaveBeenCalledWith(3, 10)
    );
  });

  test('should submit survey with default values properly, without opening prompt wizard', async () => {
    renderAdd({
      surveyConfig: {
        spec: [
          {
            question_name: 'text',
            question_description: '',
            required: true,
            type: 'text',
            variable: 'text',
            min: 0,
            max: 1024,
            default: 'text variable',
            choices: '',
            new_question: true,
          },
          {
            question_name: 'mc',
            question_description: '',
            required: true,
            type: 'multiplechoice',
            variable: 'mc',
            min: 0,
            max: 1024,
            default: 'first',
            choices: 'first\nsecond',
            new_question: true,
          },
        ],
      },
    });
    await waitFor(() => expect(formProps).toBeDefined());
    await submit({
      description: 'test description',
      frequency: [],
      name: 'Run once schedule',
      startDate: '2020-03-25',
      startTime: '10:00 AM',
      timezone: 'America/New_York',
    });
    expect(JobTemplatesAPI.createSchedule).toHaveBeenCalledWith(700, {
      description: 'test description',
      name: 'Run once schedule',
      extra_data: { mc: 'first', text: 'text variable' },
      rrule:
        'DTSTART;TZID=America/New_York:20200325T100000 RRULE:INTERVAL=1;COUNT=1;FREQ=MINUTELY',
    });
  });
});
