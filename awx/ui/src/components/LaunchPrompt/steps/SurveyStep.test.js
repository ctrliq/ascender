import React from 'react';
import { screen, within } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SurveyStep from './SurveyStep';

function makeConfig(choices) {
  return {
    name: 'survey',
    description: '',
    spec: [
      {
        question_name: 'q1',
        question_description: '',
        required: true,
        type: 'multiplechoice',
        variable: 'q1',
        min: null,
        max: null,
        default: '',
        choices,
      },
    ],
  };
}

async function openAndAssertOptions(user) {
  // The typeahead toggle is the textbox inside the MenuToggle.
  const input = screen.getByRole('textbox');
  await user.click(input);

  const listbox = screen.getByRole('listbox');
  ['1', '2', '3', '4', '5', '6'].forEach((value) => {
    expect(within(listbox).getByText(value)).toBeInTheDocument();
  });
}

describe('SurveyStep', () => {
  test('should handle choices as a string', async () => {
    const { user } = renderWithContexts(
      <Formik initialValues={{ job_type: 'run' }}>
        <SurveyStep surveyConfig={makeConfig('1\n2\n3\n4\n5\n6')} />
      </Formik>
    );

    await openAndAssertOptions(user);
  });

  test('should handle choices as an array', async () => {
    const { user } = renderWithContexts(
      <Formik initialValues={{ job_type: 'run' }}>
        <SurveyStep surveyConfig={makeConfig(['1', '2', '3', '4', '5', '6'])} />
      </Formik>
    );

    await openAndAssertOptions(user);
  });
});
