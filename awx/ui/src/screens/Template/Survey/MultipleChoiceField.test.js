import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import MultipleChoiceField from './MultipleChoiceField';

// The CheckIcon styled-component encodes the `selected` prop purely as a CSS
// color rule (selected -> secondary active color, unselected -> disabled
// color). To proxy the `selected` prop we read the resolved color on the
// rendered <svg>.
const SELECTED_COLOR = 'var(--pf-v6-c-button--m-secondary--active--Color)';

const isSelected = (ouiaId) => {
  const icon = document.querySelector(
    `[data-ouia-component-id="${ouiaId}"] svg`
  );
  return window.getComputedStyle(icon).color === SELECTED_COLOR;
};

const toggleButton = (ouiaId) =>
  document.querySelector(`[data-ouia-component-id="${ouiaId}"]`);

describe('<MultipleChoiceField/>', () => {
  test('should activate default values, multiselect', async () => {
    renderWithContexts(
      <Formik
        initialValues={{
          formattedChoices: [
            { id: 1, choice: 'apollo', isDefault: true },
            { id: 2, choice: 'alex', isDefault: true },
            { id: 3, choice: 'athena', isDefault: false },
          ],
          type: 'multiselect',
        }}
      >
        <MultipleChoiceField id="question-options" name="choices" />
      </Formik>
    );

    expect(isSelected('alex-button')).toBe(true);

    fireEvent.click(toggleButton('alex-button'));
    await waitFor(() => expect(isSelected('alex-button')).toBe(false));

    // Enter on the FIRST input (not the last) does NOT add a row.
    fireEvent.keyUp(screen.getByLabelText('apollo'), { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getAllByRole('textbox')).toHaveLength(3)
    );

    // rename the third choice (athena) to spencer
    fireEvent.change(screen.getByLabelText('athena'), {
      target: { value: 'spencer' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('spencer')).toBeInTheDocument()
    );

    fireEvent.click(toggleButton('spencer-button'));
    await waitFor(() => expect(isSelected('spencer-button')).toBe(true));

    // multiselect: toggling another choice does not deselect spencer
    fireEvent.click(toggleButton('alex-button'));
    await waitFor(() => expect(isSelected('alex-button')).toBe(true));
    expect(isSelected('spencer-button')).toBe(true);
  });

  test('should select default, multiplechoice', async () => {
    renderWithContexts(
      <Formik
        initialValues={{
          formattedChoices: [
            { choice: 'alex', isDefault: true, id: 1 },
            { choice: 'apollo', isDefault: false, id: 2 },
            { choice: 'athena', isDefault: false, id: 3 },
          ],
          type: 'multiplechoice',
        }}
      >
        <MultipleChoiceField id="question-options" name="choices" />
      </Formik>
    );

    expect(isSelected('alex-button')).toBe(true);

    fireEvent.click(toggleButton('alex-button'));
    await waitFor(() => expect(isSelected('alex-button')).toBe(false));

    expect(screen.getAllByRole('textbox')).toHaveLength(3);

    // Enter on the FIRST input (not the last) does NOT add a row.
    fireEvent.keyUp(screen.getByLabelText('alex'), { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getAllByRole('textbox')).toHaveLength(3)
    );

    // rename the third choice (athena) to spencer
    fireEvent.change(screen.getByLabelText('athena'), {
      target: { value: 'spencer' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('spencer')).toBeInTheDocument()
    );

    fireEvent.click(toggleButton('spencer-button'));
    await waitFor(() => expect(isSelected('spencer-button')).toBe(true));

    // multiplechoice: selecting spencer deselects all others (single select)
    expect(isSelected('alex-button')).toBe(false);
  });
});
