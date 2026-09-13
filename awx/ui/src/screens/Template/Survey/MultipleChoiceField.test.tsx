import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import MultipleChoiceField from './MultipleChoiceField';

// The tick encodes its selected state as a modifier class, which the
// stylesheet colours; the class is the state itself.
const SELECTED_CLASS = 'awx-multiple-choice-field__check-icon--selected';

const isSelected = (ouiaId: string) => {
  const icon = document.querySelector(
    `[data-ouia-component-id="${ouiaId}"] svg`
  );
  return icon!.classList.contains(SELECTED_CLASS);
};

const toggleButton = (ouiaId: string) =>
  document.querySelector(`[data-ouia-component-id="${ouiaId}"]`);

describe('<MultipleChoiceField/>', () => {
  test('should activate default values, multiselect', async () => {
    renderWithContexts(
      <FormRoot
        onSubmit={() => {}}
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
      </FormRoot>
    );

    expect(isSelected('alex-button')).toBe(true);

    fireEvent.click(toggleButton('alex-button')!);
    await waitFor(() => expect(isSelected('alex-button')).toBe(false));

    // Enter on the FIRST input (not the last) does NOT add a row.
    fireEvent.keyUp(screen.getByLabelText('apollo'), { key: 'Enter' });
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(3));

    // rename the third choice (athena) to spencer
    fireEvent.change(screen.getByLabelText('athena'), {
      target: { value: 'spencer' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('spencer')).toBeInTheDocument()
    );

    fireEvent.click(toggleButton('spencer-button')!);
    await waitFor(() => expect(isSelected('spencer-button')).toBe(true));

    // multiselect: toggling another choice does not deselect spencer
    fireEvent.click(toggleButton('alex-button')!);
    await waitFor(() => expect(isSelected('alex-button')).toBe(true));
    expect(isSelected('spencer-button')).toBe(true);
  });

  test('should select default, multiplechoice', async () => {
    renderWithContexts(
      <FormRoot
        onSubmit={() => {}}
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
      </FormRoot>
    );

    expect(isSelected('alex-button')).toBe(true);

    fireEvent.click(toggleButton('alex-button')!);
    await waitFor(() => expect(isSelected('alex-button')).toBe(false));

    expect(screen.getAllByRole('textbox')).toHaveLength(3);

    // Enter on the FIRST input (not the last) does NOT add a row.
    fireEvent.keyUp(screen.getByLabelText('alex'), { key: 'Enter' });
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(3));

    // rename the third choice (athena) to spencer
    fireEvent.change(screen.getByLabelText('athena'), {
      target: { value: 'spencer' },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('spencer')).toBeInTheDocument()
    );

    fireEvent.click(toggleButton('spencer-button')!);
    await waitFor(() => expect(isSelected('spencer-button')).toBe(true));

    // multiplechoice: selecting spencer deselects all others (single select)
    expect(isSelected('alex-button')).toBe(false);
  });
});
