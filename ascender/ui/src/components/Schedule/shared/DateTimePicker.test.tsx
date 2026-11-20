import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import DateTimePicker from './DateTimePicker';

// PF DatePicker wraps its calendar in a Popover whose Popper schedules a state
// update on a microtask. RTL unmounts the tree after each test, so that update
// can land after unmount and log a React "state update on unmounted component"
// warning — which the setupTests console trap turns into a failure. The warning
// is a benign artifact of unmounting a PF Popover under jsdom and is unrelated
// to DateTimePicker's behavior; filter out only that one message and forward
// everything else to the trap so real errors still fail the suite.
const realConsoleError = console.error;
// resetMocks wipes the spy before each test, so (re)install it per test.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation((...args) => {
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
afterEach(() => {
  vi.mocked(console.error).mockRestore();
});

function setup() {
  return renderWithContexts(
    <FormRoot
      onSubmit={() => {}}
      initialValues={{ startDate: '2021-05-26', startTime: '2:15 PM' }}
    >
      <DateTimePicker
        dateFieldName="startDate"
        timeFieldName="startTime"
        label="Start Date/Time"
      />
    </FormRoot>
  );
}

describe('<DateTimePicker/>', () => {
  test('should render properly', () => {
    setup();
    expect(screen.getByLabelText('Start Date')).toHaveValue('2021-05-26');
    expect(screen.getByLabelText('Start Time')).toHaveValue('2:15 PM');
  });

  test('ties the label to the date input by an id that is not translated', () => {
    const { container } = setup();
    const dateInput = screen.getByLabelText('Start Date');
    expect(dateInput).toHaveAttribute('id', 'schedule-startDate');
    expect(
      container.querySelector('label[for="schedule-startDate"]')
    ).toHaveTextContent('Start Date/Time');
  });

  test('should update values properly', async () => {
    setup();
    const dateInput = screen.getByLabelText('Start Date');
    const timeInput = screen.getByLabelText('Start Time');

    // Drive PF DatePicker/TimePicker via change events (the same path their
    // onChange handlers fire on) rather than typing.
    fireEvent.change(dateInput, { target: { value: '2021-05-29' } });
    await waitFor(() => expect(dateInput).toHaveValue('2021-05-29'));

    // The DatePicker's change opens its calendar Popover; close it and wait for
    // it to leave the DOM so its Popper doesn't schedule a state update after
    // unmount (the setupTests trap fails the suite on any console output).
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );

    fireEvent.change(timeInput, { target: { value: '7:15 PM' } });
    await waitFor(() => expect(timeInput).toHaveValue('7:15 PM'));
  });
});
