import React from 'react';
import { screen } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import ScheduleSummary from './ScheduleSummary';

function setup(initialValues: Record<string, unknown> = {}) {
  return renderWithContexts(
    <FormRoot
      onSubmit={() => {}}
      initialValues={{
        name: 'Nightly',
        description: '',
        startDate: '2026-09-28',
        startTime: '2:15 PM',
        timezone: 'UTC',
        frequency: [],
        exceptionFrequency: [],
        ...initialValues,
      }}
    >
      <ScheduleSummary />
    </FormRoot>
  );
}

describe('<ScheduleSummary />', () => {
  test('names the start as the form and the details do', () => {
    setup();
    expect(screen.getByText('Start Date/Time')).toBeInTheDocument();
    expect(screen.queryByText('First Run')).not.toBeInTheDocument();
    assertDetail('Repeat Frequency', 'None (Run Once)');
  });

  test('leaves out the exceptions when there are none', () => {
    setup({ frequency: ['day'], exceptionFrequency: [] });
    assertDetail('Repeat Frequency', 'Day');
    expect(screen.queryByText('Exception Frequency')).not.toBeInTheDocument();
  });

  test('lists the exceptions it has', () => {
    setup({ frequency: ['day'], exceptionFrequency: ['week'] });
    assertDetail('Exception Frequency', 'Week');
  });
});
