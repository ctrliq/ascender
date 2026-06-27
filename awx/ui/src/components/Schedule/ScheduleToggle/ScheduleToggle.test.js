import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SchedulesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ScheduleToggle from './ScheduleToggle';

jest.mock('../../../api');

const mockSchedule = {
  url: '/api/v2/schedules/1',
  rrule:
    'DTSTART;TZID=America/New_York:20200220T000000 RRULE:FREQ=DAILY;INTERVAL=1;COUNT=1',
  id: 1,
  summary_fields: {
    unified_job_template: {
      id: 6,
      name: 'Mock JT',
      description: '',
      unified_job_type: 'job',
    },
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
  name: 'Mock JT Schedule',
  next_run: '2020-02-20T05:00:00Z',
  enabled: true,
};

describe('<ScheduleToggle>', () => {
  test('should toggle off', async () => {
    SchedulesAPI.update.mockResolvedValue({});
    const onToggle = jest.fn();
    const { user } = renderWithContexts(
      <ScheduleToggle schedule={mockSchedule} onToggle={onToggle} />
    );
    const toggle = screen.getByRole('switch', { name: 'Toggle schedule' });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    expect(SchedulesAPI.update).toHaveBeenCalledWith(1, {
      enabled: false,
    });
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  test('should toggle on', async () => {
    SchedulesAPI.update.mockResolvedValue({});
    const onToggle = jest.fn();
    const { user } = renderWithContexts(
      <ScheduleToggle
        schedule={{
          ...mockSchedule,
          enabled: false,
        }}
        onToggle={onToggle}
      />
    );
    const toggle = screen.getByRole('switch', { name: 'Toggle schedule' });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    expect(SchedulesAPI.update).toHaveBeenCalledWith(1, {
      enabled: true,
    });
    await waitFor(() => expect(toggle).toBeChecked());
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  test('should show error modal', async () => {
    SchedulesAPI.update.mockImplementation(() => {
      throw new Error('nope');
    });
    const { user } = renderWithContexts(
      <ScheduleToggle schedule={mockSchedule} />
    );
    const toggle = screen.getByRole('switch', { name: 'Toggle schedule' });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });
});
