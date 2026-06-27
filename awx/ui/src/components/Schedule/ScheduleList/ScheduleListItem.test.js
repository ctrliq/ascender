import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ScheduleListItem from './ScheduleListItem';

const mockSchedule = {
  rrule:
    'DTSTART;TZID=America/New_York:20200220T000000 RRULE:FREQ=DAILY;INTERVAL=1;COUNT=1',
  id: 6,
  type: 'schedule',
  url: '/api/v2/schedules/6/',
  related: {},
  summary_fields: {
    unified_job_template: {
      id: 12,
      name: 'Mock JT',
      description: '',
      unified_job_type: 'job',
    },
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
  created: '2020-02-12T21:05:08.460029Z',
  modified: '2020-02-12T21:05:52.840596Z',
  name: 'Mock Schedule',
  description: 'every day for 1 time',
  extra_data: {},
  inventory: null,
  scm_branch: null,
  job_type: null,
  job_tags: null,
  skip_tags: null,
  limit: null,
  diff_mode: null,
  verbosity: null,
  unified_job_template: 12,
  enabled: true,
  dtstart: '2020-02-20T05:00:00Z',
  dtend: '2020-02-20T05:00:00Z',
  next_run: '2020-02-20T05:00:00Z',
  timezone: 'America/New_York',
  until: '',
};

const onSelect = jest.fn();

function renderItem(props) {
  return renderWithContexts(
    <table>
      <tbody>
        <ScheduleListItem
          isSelected={false}
          onSelect={onSelect}
          schedule={mockSchedule}
          isMissingSurvey={false}
          isMissingInventory={false}
          {...props}
        />
      </tbody>
    </table>
  );
}

const cellByLabel = (label) =>
  document.querySelector(`td[data-label="${label}"]`);

describe('ScheduleListItem', () => {
  beforeEach(() => {
    onSelect.mockClear();
  });

  describe('User has edit permissions', () => {
    test('Name correctly shown with correct link', () => {
      renderItem();
      const link = screen.getByRole('link', { name: 'Mock Schedule' });
      expect(link).toHaveAttribute(
        'href',
        '/templates/job_template/12/schedules/6/details'
      );
    });

    test('Related resource correctly shown', () => {
      renderItem();
      const cell = cellByLabel('Related resource');
      expect(cell).toHaveTextContent('Mock JT');
    });

    test('Resource type correctly shown', () => {
      renderItem();
      const cell = cellByLabel('Resource type');
      expect(cell).toHaveTextContent('Playbook Run');
    });

    test('Next run correctly shown', () => {
      renderItem();
      const cell = cellByLabel('Next Run');
      expect(cell).toHaveTextContent('2/20/2020, 12:00:00 AM');
    });

    test('Edit button shown with correct link', () => {
      renderItem();
      const editLink = screen.getByRole('link', { name: 'Edit Schedule' });
      expect(editLink).toHaveAttribute(
        'href',
        '/templates/job_template/12/schedules/6/edit'
      );
    });

    test('Toggle button enabled', () => {
      renderItem();
      expect(
        screen.getByRole('switch', { name: 'Toggle schedule' })
      ).toBeEnabled();
    });

    test('Clicking checkbox selects item', async () => {
      const { user } = renderItem();
      await user.click(screen.getByRole('checkbox', { name: /select/i }));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('User has read-only permissions', () => {
    const readOnlySchedule = {
      ...mockSchedule,
      summary_fields: {
        ...mockSchedule.summary_fields,
        user_capabilities: {
          edit: false,
          delete: false,
        },
      },
    };

    test('Name correctly shown with correct link', () => {
      renderItem({ schedule: readOnlySchedule });
      expect(
        screen.getByRole('link', { name: 'Mock Schedule' })
      ).toHaveAttribute(
        'href',
        '/templates/job_template/12/schedules/6/details'
      );
    });

    test('Related resource correctly shown', () => {
      renderItem({ schedule: readOnlySchedule });
      expect(cellByLabel('Related resource')).toHaveTextContent('Mock JT');
    });

    test('Resource type correctly shown', () => {
      renderItem({ schedule: readOnlySchedule });
      expect(cellByLabel('Resource type')).toHaveTextContent('Playbook Run');
    });

    test('Next run correctly shown', () => {
      renderItem({ schedule: readOnlySchedule });
      expect(cellByLabel('Next Run')).toHaveTextContent('2/20/2020, 12:00:00 AM');
    });

    test('Edit button hidden', () => {
      renderItem({ schedule: readOnlySchedule });
      expect(
        screen.queryByRole('link', { name: 'Edit Schedule' })
      ).not.toBeInTheDocument();
    });

    test('Toggle button disabled', () => {
      renderItem({ schedule: readOnlySchedule });
      expect(
        screen.getByRole('switch', { name: 'Toggle schedule' })
      ).toBeDisabled();
    });
  });

  describe('schedule has missing prompt data', () => {
    test('should show missing resource icon and disable the toggle', () => {
      renderItem({
        schedule: {
          ...mockSchedule,
          summary_fields: {
            ...mockSchedule.summary_fields,
            user_capabilities: { edit: false, delete: false },
          },
        },
        isMissingInventory: 'Inventory Error',
        isMissingSurvey: 'Survey Error',
      });
      // ExclamationTriangleIcon renders an svg inside the Name cell tooltip wrapper
      const nameCell = cellByLabel('Name');
      expect(nameCell.querySelector('svg')).toBeInTheDocument();
      expect(
        screen.getByRole('switch', { name: 'Toggle schedule' })
      ).toBeDisabled();
    });
  });
});
