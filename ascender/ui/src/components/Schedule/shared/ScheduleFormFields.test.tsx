import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ScheduleFormFields from './ScheduleFormFields';

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
        daysToKeep: 30,
        ...initialValues,
      }}
    >
      <ScheduleFormFields
        hasDaysToKeepField
        zoneOptions={[{ value: 'UTC', key: 'UTC', label: 'UTC' }]}
        zoneLinks={{}}
      />
    </FormRoot>
  );
}

describe('<ScheduleFormFields />', () => {
  test.each([
    ['-1', true],
    ['2.5', true],
    ['100000', true],
    ['', true],
    ['0', false],
    ['99999', false],
  ])(
    'holds the days to keep to a whole number the api takes: %s',
    async (typed, isRefused) => {
      const { container } = setup();
      const input = container.querySelector('#schedule-days-to-keep')!;
      fireEvent.change(input, { target: { value: typed } });
      fireEvent.blur(input);
      const message = 'Enter a whole number of days from 0 to 99999.';
      if (isRefused) {
        expect(await screen.findByText(message)).toBeInTheDocument();
      } else {
        // Let formik finish validating before asserting nothing was said.
        await screen.findByDisplayValue(typed);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        expect(screen.queryByText(message)).not.toBeInTheDocument();
      }
    }
  );

  test('says a schedule with no repeat runs once, in the details words', () => {
    setup();
    expect(screen.getByText('None (Run Once)')).toBeInTheDocument();
  });

  test('labels the exception select as the details do', () => {
    setup({ frequency: ['day'] });
    expect(screen.getByText('Exception Frequency')).toBeInTheDocument();
    expect(screen.queryByText('Add Exceptions')).not.toBeInTheDocument();
  });
});
