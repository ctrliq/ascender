import React from 'react';
import { FormRoot } from 'components/Form';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import DaysToKeepStep from './DaysToKeepStep';

describe('DaysToKeepStep', () => {
  test('Days to keep field rendered correctly', () => {
    renderWithContexts(
      <FormRoot onSubmit={() => {}} initialValues={{ daysToKeep: 30 }}>
        <DaysToKeepStep />
      </FormRoot>
    );
    const input = document.querySelector('input#days-to-keep');
    // FormField#days-to-keep is rendered
    expect(input).toBeInTheDocument();
    // isRequired is passed through to the underlying input
    expect(input).toBeRequired();
    // initial value comes from Formik (rendered into a text input as a string)
    expect(input).toHaveValue('30');
  });
});
