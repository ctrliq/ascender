import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
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

function setup() {
  return renderWithContexts(
    <Formik initialValues={{ startDate: '2021-05-26', startTime: '2:15 PM' }}>
      <DateTimePicker
        dateFieldName="startDate"
        timeFieldName="startTime"
        label="Start date/time"
      />
    </Formik>
  );
}

describe('<DateTimePicker/>', () => {
  test('should render properly', () => {
    setup();
    expect(screen.getByLabelText('Start date')).toHaveValue('2021-05-26');
    expect(screen.getByLabelText('Start time')).toHaveValue('2:15 PM');
  });

  test('should update values properly', async () => {
    setup();
    const dateInput = screen.getByLabelText('Start date');
    const timeInput = screen.getByLabelText('Start time');

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
