import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SurveyQuestionAdd from './SurveyQuestionAdd';

const survey = {
  spec: [
    {
      question_name: 'What is the foo?',
      question_description: 'more about the foo',
      variable: 'foo',
      required: true,
      type: 'text',
      min: 0,
      max: 1024,
    },
    {
      question_name: 'Who shot the sheriff?',
      question_description: 'they did not shoot the deputy',
      variable: 'bar',
      required: true,
      type: 'textarea',
      min: 0,
      max: 1024,
    },
  ],
};

// Fill in a new text question and submit the real form.
function addQuestion(variable = 'question') {
  fireEvent.change(document.querySelector('#question-name'), {
    target: { value: 'new question' },
  });
  fireEvent.change(document.querySelector('#question-variable'), {
    target: { value: variable },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('<SurveyQuestionAdd />', () => {
  let updateSurvey;

  beforeEach(() => {
    updateSurvey = jest.fn();
  });

  test('should render form', () => {
    renderWithContexts(
      <SurveyQuestionAdd survey={survey} updateSurvey={updateSurvey} />
    );

    expect(
      screen.getByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
    expect(document.querySelector('#question-name')).toBeInTheDocument();
  });

  test('should call updateSurvey', async () => {
    renderWithContexts(
      <SurveyQuestionAdd survey={survey} updateSurvey={updateSurvey} />
    );

    addQuestion();

    await waitFor(() => expect(updateSurvey).toHaveBeenCalled());
    const newSpec = updateSurvey.mock.calls[0][0];
    // existing questions are preserved, new question is appended
    expect(newSpec).toHaveLength(3);
    expect(newSpec[0]).toEqual(survey.spec[0]);
    expect(newSpec[1]).toEqual(survey.spec[1]);
    expect(newSpec[2]).toEqual(
      expect.objectContaining({
        question_name: 'new question',
        variable: 'question',
        type: 'text',
      })
    );
  });

  test('should set formError', async () => {
    const realConsoleError = global.console.error;
    global.console.error = jest.fn();
    const err = new Error('oops');
    updateSurvey.mockImplementation(() => {
      throw err;
    });
    renderWithContexts(
      <SurveyQuestionAdd survey={survey} updateSurvey={updateSurvey} />
    );

    addQuestion();

    // FormSubmitError surfaces the thrown error message in the form
    expect(await screen.findByText('oops')).toBeInTheDocument();
    global.console.error = realConsoleError;
  });

  test('should generate error for duplicate variable names', async () => {
    const realConsoleError = global.console.error;
    global.console.error = jest.fn();
    renderWithContexts(
      <SurveyQuestionAdd survey={survey} updateSurvey={updateSurvey} />
    );

    addQuestion('foo');

    expect(
      await screen.findByText(
        'Survey already contains a question with variable named “foo”'
      )
    ).toBeInTheDocument();
    expect(updateSurvey).not.toHaveBeenCalled();
    global.console.error = realConsoleError;
  });
});
