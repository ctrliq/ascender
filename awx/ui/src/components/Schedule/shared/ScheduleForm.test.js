import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { DateTime } from 'luxon';

import { dateToInputDateTime } from 'util/dates';
import { SchedulesAPI, JobTemplatesAPI, InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ScheduleForm from './ScheduleForm';

jest.mock('../../../api/models/Schedules');
jest.mock('../../../api/models/JobTemplates');
jest.mock('../../../api/models/Inventories');

// PF DatePicker/Select wrap their menus in Popovers/Poppers that can schedule a
// state update after the tree unmounts under jsdom. That benign warning is
// unrelated to ScheduleForm and would trip the setupTests console trap, so
// filter only that message and forward everything else.
const realConsoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes(
        "Can't perform a React state update on an unmounted component"
      )
    ) {
      return;
    }
    realConsoleError(...args);
  });
});
afterAll(() => {
  console.error.mockRestore();
});

const credentials = {
  data: {
    results: [
      { id: 1, kind: 'cloud', name: 'Cred 1', url: 'www.google.com', inputs: {} },
      { id: 2, kind: 'ssh', name: 'Cred 2', url: 'www.google.com', inputs: {} },
      { id: 3, kind: 'Ansible', name: 'Cred 3', url: 'www.google.com', inputs: {} },
      { id: 4, kind: 'Machine', name: 'Cred 4', url: 'www.google.com', inputs: {} },
      { id: 5, kind: 'Machine', name: 'Cred 5', url: 'www.google.com', inputs: {} },
    ],
  },
};

const launchData = {
  data: {
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
    ask_credential_on_launch: false,
    ask_execution_environment_on_launch: false,
    ask_labels_on_launch: false,
    ask_forks_on_launch: false,
    ask_job_slice_count_on_launch: false,
    ask_timeout_on_launch: false,
    ask_instance_groups_on_launch: false,
    survey_enabled: false,
    variables_needed_to_start: [],
    credential_needed_to_start: false,
    inventory_needed_to_start: true,
    job_template_data: { name: 'Demo Job Template', id: 7, description: '' },
  },
};

const fullLaunchConfig = {
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
  ask_credential_on_launch: false,
  ask_execution_environment_on_launch: false,
  ask_labels_on_launch: false,
  ask_forks_on_launch: false,
  ask_job_slice_count_on_launch: false,
  ask_timeout_on_launch: false,
  ask_instance_groups_on_launch: false,
  survey_enabled: false,
  variables_needed_to_start: [],
  credential_needed_to_start: false,
  inventory_needed_to_start: true,
  job_template_data: { name: 'Demo Job Template', id: 7, description: '' },
};

const mockSchedule = {
  rrule:
    'DTSTART;TZID=America/New_York:20200402T144500 RRULE:INTERVAL=1;COUNT=1;FREQ=MINUTELY',
  id: 27,
  type: 'schedule',
  url: '/api/v2/schedules/27/',
  summary_fields: {
    user_capabilities: { edit: true, delete: true },
  },
  created: '2020-04-02T18:43:12.664142Z',
  modified: '2020-04-02T18:43:12.664185Z',
  name: 'mock schedule',
  description: 'test description',
  extra_data: {},
  inventory: 1,
  scm_branch: null,
  job_type: null,
  job_tags: null,
  skip_tags: null,
  limit: null,
  diff_mode: null,
  verbosity: null,
  unified_job_template: 11,
  enabled: true,
  dtstart: '2020-04-02T18:45:00Z',
  dtend: '2020-04-02T18:45:00Z',
  next_run: '2020-04-02T18:45:00Z',
  timezone: 'America/New_York',
  until: '',
};

const byId = (container, id) => container.querySelector(`#${CSS.escape(id)}`);

// FrequencySelect (PF Select) carries its id only on the ouia wrapper div, not
// on a queryable input.
const freqSelect = (container, id) =>
  container.querySelector(`[data-ouia-component-id="frequency-select-${id}"]`);

// Wait until the form has finished loading (the name input is present).
async function waitForForm(container) {
  await waitFor(() =>
    expect(byId(container, 'schedule-name')).toBeInTheDocument()
  );
}

// Choose a run-frequency from the (multi-select checkbox) FrequencySelect. The
// run-frequency select is the first PF select toggle in the form.
async function selectRunFrequency(user, container, optionLabel) {
  const toggle = container.querySelectorAll('.pf-c-select__toggle')[0];
  await user.click(toggle);
  await user.click(await screen.findByText(optionLabel));
  // close the menu so it doesn't linger
  await user.click(toggle);
}

// Mirrors the original defaultFieldsVisible(): core fields + (optionally) the
// exception FrequencySelect once a run-frequency has been chosen.
function defaultFieldsVisible(container, isExceptionsVisible) {
  expect(byId(container, 'schedule-name')).toBeInTheDocument();
  expect(byId(container, 'schedule-description')).toBeInTheDocument();
  expect(screen.getByLabelText('Start date')).toBeInTheDocument();
  expect(byId(container, 'schedule-timezone')).toBeInTheDocument();
  // the run-frequency select is always present
  expect(freqSelect(container, 'schedule-frequency')).toBeInTheDocument();
  if (isExceptionsVisible) {
    expect(freqSelect(container, 'exception-frequency')).toBeInTheDocument();
  } else {
    expect(freqSelect(container, 'exception-frequency')).not.toBeInTheDocument();
  }
}

function nonRRuleValuesMatch(container) {
  expect(byId(container, 'schedule-name')).toHaveValue('mock schedule');
  expect(byId(container, 'schedule-description')).toHaveValue(
    'test description'
  );
  expect(screen.getByLabelText('Start date')).toHaveValue('2020-04-02');
  expect(screen.getByLabelText('Start time')).toHaveValue('2:45 PM');
  expect(byId(container, 'schedule-timezone')).toHaveValue('America/New_York');
}

describe('<ScheduleForm />', () => {
  describe('Error', () => {
    test('should display error when error occurs while loading', async () => {
      SchedulesAPI.readZoneInfo.mockRejectedValue(new Error());
      renderWithContexts(
        <ScheduleForm
          handleSubmit={jest.fn()}
          handleCancel={jest.fn()}
          launchConfig={fullLaunchConfig}
          resource={{
            id: 23,
            type: 'job_template',
            name: 'Foo Job Template',
            description: '',
          }}
        />
      );
      expect(
        await screen.findByText('Something went wrong...')
      ).toBeInTheDocument();
    });
  });

  describe('Cancel', () => {
    test('should make the appropriate callback', async () => {
      const handleCancel = jest.fn();
      JobTemplatesAPI.readLaunch.mockResolvedValue(launchData);
      SchedulesAPI.readCredentials.mockResolvedValue(credentials);
      SchedulesAPI.readZoneInfo.mockResolvedValue({
        data: { zones: ['UTC', 'America/New_York'], links: {} },
      });
      const { user, container } = renderWithContexts(
        <ScheduleForm
          handleSubmit={jest.fn()}
          handleCancel={handleCancel}
          launchConfig={fullLaunchConfig}
          resource={{
            id: 23,
            type: 'job_template',
            inventory: 1,
            name: 'Foo Job Template',
            description: '',
          }}
        />
      );
      await waitForForm(container);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Prompted Schedule', () => {
    const promptLaunchConfig = { ...fullLaunchConfig };

    beforeEach(() => {
      SchedulesAPI.readZoneInfo.mockResolvedValue({
        data: { zones: ['UTC', 'America/New_York'], links: {} },
      });
    });

    function renderPrompt(resource, surveyConfig) {
      return renderWithContexts(
        <ScheduleForm
          handleSubmit={jest.fn()}
          handleCancel={jest.fn()}
          resource={resource}
          launchConfig={promptLaunchConfig}
          surveyConfig={surveyConfig}
        />
      );
    }

    test('should open prompt modal with proper steps and default values', async () => {
      const { user, container } = renderPrompt(
        {
          id: 23,
          type: 'job_template',
          inventory: 1,
          summary_fields: { credentials: [] },
          name: 'Foo Job Template',
          description: '',
        },
        { spec: [{ required: true, default: '' }] }
      );
      await waitForForm(container);
      await user.click(await screen.findByRole('button', { name: 'Prompt' }));
      // the prompt wizard opens with an Inventory step and a Preview step
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getAllByText('Inventory').length).toBeGreaterThan(0);
      expect(within(dialog).getByText('Preview')).toBeInTheDocument();
    });

    test('should render disabled save button due to missing required survey values', async () => {
      const { container } = renderPrompt(
        {
          id: 23,
          type: 'job_template',
          inventory: 1,
          summary_fields: { credentials: [] },
          name: 'Foo Job Template',
          description: '',
        },
        { spec: [{ required: true, default: '' }] }
      );
      await waitForForm(container);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      );
    });

    test('should update prompt modal data', async () => {
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

      const { user, container } = renderPrompt(
        {
          id: 23,
          type: 'job_template',
          inventory: 1,
          summary_fields: { credentials: [] },
          name: 'Foo Job Template',
          description: '',
        },
        { spec: [{ required: true, default: '' }] }
      );
      await waitForForm(container);
      await user.click(await screen.findByRole('button', { name: 'Prompt' }));
      const dialog = await screen.findByRole('dialog');

      // The inventory list loads after the lookup's 1s debounce; wait for its
      // row checkbox to appear, then do each interaction exactly once (never a
      // click inside a waitFor retry).
      let invCheckbox;
      await waitFor(
        () => {
          invCheckbox = dialog.querySelector('#check-action-item-1 input');
          expect(invCheckbox).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
      await user.click(invCheckbox);
      await waitFor(() => expect(invCheckbox).toBeChecked());

      // advance: inventory step -> preview step (final step shows Save)
      await user.click(within(dialog).getByRole('button', { name: 'Next' }));
      const save = await within(dialog).findByRole('button', { name: 'Save' });
      await user.click(save);
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
    });

    test('should render prompt button with disabled save button', async () => {
      const { container } = renderPrompt(
        {
          id: 23,
          type: 'job_template',
          name: 'Foo Job Template',
          description: '',
        },
        { spec: [{ required: true, default: '' }] }
      );
      await waitForForm(container);
      await screen.findByRole('button', { name: 'Prompt' });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      );
    });
  });

  describe('Add', () => {
    let container;
    let user;

    beforeEach(async () => {
      SchedulesAPI.readZoneInfo.mockResolvedValue({
        data: { zones: ['UTC', 'America/New_York'], links: {} },
      });
      ({ container, user } = renderWithContexts(
        <ScheduleForm
          handleSubmit={jest.fn()}
          handleCancel={jest.fn()}
          resource={{
            id: 23,
            type: 'job_template',
            inventory: 1,
            name: 'Foo Job Template',
            description: '',
          }}
          launchConfig={{
            ...fullLaunchConfig,
            can_start_without_user_input: true,
            ask_inventory_on_launch: false,
            inventory_needed_to_start: false,
          }}
        />
      ));
      await waitForForm(container);
    });

    test('initially renders expected fields and values', () => {
      const now = DateTime.now();
      const closestQuarterHour = DateTime.fromMillis(
        Math.ceil(now.ts / 900000) * 900000
      );
      const [date, time] = dateToInputDateTime(closestQuarterHour.toISO());

      defaultFieldsVisible(container, false);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-minute')
      ).not.toBeInTheDocument();

      expect(byId(container, 'schedule-name')).toHaveValue('');
      expect(byId(container, 'schedule-description')).toHaveValue('');
      expect(screen.getByLabelText('Start date')).toHaveValue(`${date}`);
      expect(screen.getByLabelText('Start time')).toHaveValue(`${time}`);
      expect(byId(container, 'schedule-timezone')).toHaveValue('UTC');
    });

    test('correct frequency details fields and values shown when frequency changed to minute', async () => {
      await selectRunFrequency(user, container, 'Minute');
      defaultFieldsVisible(container, true);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-minute')
      ).toHaveValue(1);
      expect(
        byId(container, 'end-never-frequencyOptions-minute')
      ).toBeChecked();
      expect(
        byId(container, 'end-after-frequencyOptions-minute')
      ).not.toBeChecked();
      expect(
        byId(container, 'end-on-date-frequencyOptions-minute')
      ).not.toBeChecked();
      // On days / Run on are not shown for minute
      expect(
        byId(container, 'schedule-days-of-week-mon-frequencyOptions-minute')
      ).not.toBeInTheDocument();
      expect(
        byId(container, 'schedule-run-on-day-frequencyOptions-minute')
      ).not.toBeInTheDocument();
    });

    test('correct frequency details fields and values shown when frequency changed to hour', async () => {
      await selectRunFrequency(user, container, 'Hour');
      defaultFieldsVisible(container, true);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-hour')
      ).toHaveValue(1);
      expect(byId(container, 'end-never-frequencyOptions-hour')).toBeChecked();
      expect(
        byId(container, 'end-after-frequencyOptions-hour')
      ).not.toBeChecked();
      expect(
        byId(container, 'end-on-date-frequencyOptions-hour')
      ).not.toBeChecked();
    });

    test('correct frequency details fields and values shown when frequency changed to day', async () => {
      await selectRunFrequency(user, container, 'Day');
      defaultFieldsVisible(container, true);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-day')
      ).toHaveValue(1);
      expect(byId(container, 'end-never-frequencyOptions-day')).toBeChecked();
      expect(
        byId(container, 'schedule-days-of-week-mon-frequencyOptions-day')
      ).not.toBeInTheDocument();
    });

    test('correct frequency details fields and values shown when frequency changed to week', async () => {
      await selectRunFrequency(user, container, 'Week');
      defaultFieldsVisible(container, true);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-week')
      ).toHaveValue(1);
      expect(byId(container, 'end-never-frequencyOptions-week')).toBeChecked();
      // On days is shown for week
      expect(
        byId(container, 'schedule-days-of-week-mon-frequencyOptions-week')
      ).toBeInTheDocument();
    });

    test('correct frequency details fields and values shown when frequency changed to month', async () => {
      await selectRunFrequency(user, container, 'Month');
      defaultFieldsVisible(container, true);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-month')
      ).toHaveValue(1);
      expect(byId(container, 'end-never-frequencyOptions-month')).toBeChecked();
      expect(
        byId(container, 'schedule-run-on-day-frequencyOptions-month')
      ).toBeChecked();
      expect(
        byId(container, 'schedule-run-on-day-number-frequencyOptions-month')
      ).toHaveValue(1);
      expect(
        byId(container, 'schedule-run-on-the-frequencyOptions-month')
      ).not.toBeChecked();
    });

    test('correct frequency details fields and values shown when frequency changed to year', async () => {
      await selectRunFrequency(user, container, 'Year');
      defaultFieldsVisible(container, true);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-year')
      ).toHaveValue(1);
      expect(byId(container, 'end-never-frequencyOptions-year')).toBeChecked();
      expect(
        byId(container, 'schedule-run-on-day-frequencyOptions-year')
      ).toBeChecked();
      expect(
        byId(container, 'schedule-run-on-the-frequencyOptions-year')
      ).not.toBeChecked();
      expect(
        byId(container, 'schedule-run-on-day-month-frequencyOptions-year')
      ).toBeInTheDocument();
      expect(
        byId(container, 'schedule-run-on-the-month-frequencyOptions-year')
      ).toBeInTheDocument();
    });

    test('occurrences field properly shown when end after selection is made', async () => {
      await selectRunFrequency(user, container, 'Minute');
      await user.click(byId(container, 'end-after-frequencyOptions-minute'));
      expect(
        byId(container, 'end-never-frequencyOptions-minute')
      ).not.toBeChecked();
      expect(
        byId(container, 'end-after-frequencyOptions-minute')
      ).toBeChecked();
      expect(
        byId(container, 'schedule-occurrences-frequencyOptions-minute')
      ).toHaveValue(1);

      await user.click(byId(container, 'end-never-frequencyOptions-minute'));
      expect(
        byId(container, 'schedule-occurrences-frequencyOptions-minute')
      ).not.toBeInTheDocument();
    });

    test('error shown when end date/time comes before start date/time', async () => {
      await selectRunFrequency(user, container, 'Minute');
      await user.click(byId(container, 'end-on-date-frequencyOptions-minute'));
      expect(
        byId(container, 'end-on-date-frequencyOptions-minute')
      ).toBeChecked();

      const endDate = screen.getByLabelText('End date');
      fireEvent.change(endDate, { target: { value: '2020-03-14' } });

      expect(
        await screen.findByText(
          'Please select an end date/time that comes after the start date/time.'
        )
      ).toBeInTheDocument();
      // settle the date popover before unmount
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    test('error shown when on day number is not between 1 and 31', async () => {
      await selectRunFrequency(user, container, 'Month');
      const dayNumber = byId(
        container,
        'schedule-run-on-day-number-frequencyOptions-month'
      );
      fireEvent.change(dayNumber, { target: { value: 32 } });
      expect(dayNumber).toHaveValue(32);

      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(
        await screen.findByText(
          'Please select a day number between 1 and 31.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('Edit', () => {
    beforeEach(() => {
      SchedulesAPI.readZoneInfo.mockResolvedValue({
        data: { zones: ['UTC', 'America/New_York'], links: {} },
      });
      SchedulesAPI.readCredentials.mockResolvedValue(credentials);
      SchedulesAPI.readAllLabels.mockResolvedValue({
        data: { count: 0, results: [] },
      });
      SchedulesAPI.readInstanceGroups.mockResolvedValue({
        data: { count: 0, results: [] },
      });
    });

    function renderEdit(schedule, extraLaunch, resource) {
      return renderWithContexts(
        <ScheduleForm
          handleSubmit={jest.fn()}
          handleCancel={jest.fn()}
          schedule={schedule}
          launchConfig={{ inventory_needed_to_start: false, ...extraLaunch }}
          resource={
            resource || {
              id: 23,
              type: 'job_template',
              name: 'Foo Job Template',
              description: '',
            }
          }
        />
      );
    }

    test('should make API calls to fetch credentials, labels, and zone info', async () => {
      const { container } = renderEdit(
        { inventory: null, ...mockSchedule },
        {
          can_start_without_user_input: true,
          ask_inventory_on_launch: false,
          ask_credential_on_launch: true,
          ask_labels_on_launch: true,
        },
        {
          id: 23,
          type: 'job_template',
          name: 'Foo Job Template',
          description: '',
          summary_fields: { credentials: [] },
        }
      );
      await waitForForm(container);
      expect(SchedulesAPI.readZoneInfo).toHaveBeenCalled();
      expect(SchedulesAPI.readCredentials).toHaveBeenCalledWith(27);
      expect(SchedulesAPI.readAllLabels).toHaveBeenCalledWith(27);
    });

    test('should not call API to get credentials ', async () => {
      const { container } = renderEdit(undefined, {
        can_start_without_user_input: true,
      });
      await waitForForm(container);
      expect(SchedulesAPI.readCredentials).not.toHaveBeenCalled();
    });

    test('should render prompt button with enabled save button for project', async () => {
      const { container } = renderWithContexts(
        <ScheduleForm
          handleSubmit={jest.fn()}
          handleCancel={jest.fn()}
          resource={{
            id: 23,
            type: 'project',
            inventory: 2,
            name: 'Foo Project',
            description: '',
          }}
          launchConfig={{
            ...fullLaunchConfig,
            can_start_without_user_input: true,
            ask_inventory_on_launch: false,
            inventory_needed_to_start: false,
          }}
        />
      );
      await waitForForm(container);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
      );
    });

    test('initially renders expected fields and values with existing schedule that runs once', async () => {
      const { container } = renderEdit({ ...mockSchedule });
      await waitForForm(container);
      defaultFieldsVisible(container, false);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-minute')
      ).not.toBeInTheDocument();
      nonRRuleValuesMatch(container);
    });

    test('initially renders expected fields and values with existing schedule that runs every 10 minutes', async () => {
      const { container } = renderEdit({
        ...mockSchedule,
        rrule:
          'DTSTART;TZID=America/New_York:20200402T144500 RRULE:INTERVAL=10;FREQ=MINUTELY',
        dtend: null,
      });
      await waitForForm(container);
      defaultFieldsVisible(container, true);
      nonRRuleValuesMatch(container);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-minute')
      ).toHaveValue(10);
      expect(
        byId(container, 'end-never-frequencyOptions-minute')
      ).toBeChecked();
    });

    test('initially renders expected fields and values with existing schedule that runs every hour 10 times', async () => {
      const { container } = renderEdit({
        ...mockSchedule,
        rrule:
          'DTSTART;TZID=America/New_York:20200402T144500 RRULE:INTERVAL=1;FREQ=HOURLY;COUNT=10',
        dtend: '2020-04-03T03:45:00Z',
        until: '',
      });
      await waitForForm(container);
      defaultFieldsVisible(container, true);
      nonRRuleValuesMatch(container);
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-hour')
      ).toHaveValue(1);
      expect(
        byId(container, 'end-after-frequencyOptions-hour')
      ).toBeChecked();
      expect(
        byId(container, 'schedule-occurrences-frequencyOptions-hour')
      ).toHaveValue(10);
    });

    test('initially renders expected fields and values with existing schedule that runs every day', async () => {
      const { container } = renderEdit({
        ...mockSchedule,
        rrule:
          'DTSTART;TZID=America/New_York:20200402T144500 RRULE:INTERVAL=1;FREQ=DAILY',
        dtend: null,
        until: '',
      });
      await waitForForm(container);
      defaultFieldsVisible(container, true);
      nonRRuleValuesMatch(container);
      expect(byId(container, 'end-never-frequencyOptions-day')).toBeChecked();
      expect(
        byId(container, 'schedule-run-every-frequencyOptions-day')
      ).toHaveValue(1);
    });

    test('initially renders expected fields and values with existing schedule that runs every week on m/w/f until Jan 1, 2020', async () => {
      const { container } = renderEdit({
        ...mockSchedule,
        rrule:
          'DTSTART;TZID=America/New_York:20200402T144500 RRULE:INTERVAL=1;FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20210101T050000Z',
        dtend: '2020-10-30T18:45:00Z',
        until: '2021-01-01T01:00:00',
      });
      await waitForForm(container);
      await waitFor(() =>
        expect(
          byId(container, 'schedule-days-of-week-mon-frequencyOptions-week')
        ).toBeChecked()
      );
      defaultFieldsVisible(container, true);
      nonRRuleValuesMatch(container);
      expect(
        byId(container, 'end-on-date-frequencyOptions-week')
      ).toBeChecked();
      expect(
        byId(container, 'schedule-days-of-week-sun-frequencyOptions-week')
      ).not.toBeChecked();
      expect(
        byId(container, 'schedule-days-of-week-mon-frequencyOptions-week')
      ).toBeChecked();
      expect(
        byId(container, 'schedule-days-of-week-wed-frequencyOptions-week')
      ).toBeChecked();
      expect(
        byId(container, 'schedule-days-of-week-fri-frequencyOptions-week')
      ).toBeChecked();
      expect(screen.getByLabelText('End date')).toHaveValue('2021-01-01');
      expect(screen.getByLabelText('End time')).toHaveValue('12:00 AM');
    });

    test('initially renders expected fields and values with existing schedule that runs every month on the last weekday', async () => {
      const { container } = renderEdit({
        ...mockSchedule,
        rrule:
          'DTSTART;TZID=America/New_York:20200402T144500 RRULE:INTERVAL=1;FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR',
        dtend: null,
        until: '',
      });
      await waitForForm(container);
      defaultFieldsVisible(container, true);
      nonRRuleValuesMatch(container);
      expect(byId(container, 'end-never-frequencyOptions-month')).toBeChecked();
      expect(
        byId(container, 'schedule-run-on-the-frequencyOptions-month')
      ).toBeChecked();
      expect(
        byId(
          container,
          'schedule-run-on-the-occurrence-frequencyOptions-month'
        )
      ).toHaveValue('-1');
      expect(
        byId(container, 'schedule-run-on-the-day-frequencyOptions-month')
      ).toHaveValue('weekday');
    });

    test('initially renders expected fields and values with existing schedule that runs every year on the May 6', async () => {
      const { container } = renderEdit({
        ...mockSchedule,
        rrule:
          'DTSTART;TZID=America/New_York:20200402T144500 RRULE:INTERVAL=1;FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=6',
        dtend: null,
        until: '',
      });
      await waitForForm(container);
      defaultFieldsVisible(container, true);
      nonRRuleValuesMatch(container);
      expect(byId(container, 'end-never-frequencyOptions-year')).toBeChecked();
      expect(
        byId(container, 'schedule-run-on-day-frequencyOptions-year')
      ).toBeChecked();
      expect(
        byId(container, 'schedule-run-on-day-month-frequencyOptions-year')
      ).toHaveValue('5');
      expect(
        byId(container, 'schedule-run-on-day-number-frequencyOptions-year')
      ).toHaveValue(6);
    });
  });
});
