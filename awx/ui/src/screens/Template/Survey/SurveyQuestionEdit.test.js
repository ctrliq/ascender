import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SurveyQuestionEdit from './SurveyQuestionEdit';

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

function renderEdit(surveyData, history, updateSurvey) {
  return renderWithContexts(
    <Routes>
      <Route
        path="/templates/:templateType/:id/survey/edit"
        element={
          <SurveyQuestionEdit survey={surveyData} updateSurvey={updateSurvey} />
        }
      />
      {/* destination route for the redirect/navigate-to-list assertions */}
      <Route
        path="/templates/:templateType/:id/survey"
        element={<div data-testid="survey-list" />}
      />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

// Edit the form (pre-filled from the foo question) and submit.
function editAndSubmit(variable) {
  fireEvent.change(document.querySelector('#question-name'), {
    target: { value: 'new question' },
  });
  fireEvent.change(document.querySelector('#question-variable'), {
    target: { value: variable },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('<SurveyQuestionEdit />', () => {
  let updateSurvey;
  let history;

  describe('with question_variable present', () => {
    beforeEach(() => {
      history = createMemoryHistory({
        initialEntries: [
          '/templates/job_templates/1/survey/edit?question_variable=foo',
        ],
      });
      updateSurvey = jest.fn();
      renderEdit(survey, history, updateSurvey);
    });

    test('should render form', () => {
      expect(
        screen.getByRole('button', { name: 'Save' })
      ).toBeInTheDocument();
      // form is pre-filled with the foo question
      expect(document.querySelector('#question-variable')).toHaveValue('foo');
    });

    test('should call updateSurvey', async () => {
      editAndSubmit('question');

      await waitFor(() => expect(updateSurvey).toHaveBeenCalled());
      const newSpec = updateSurvey.mock.calls[0][0];
      // the edited question replaces spec[0], spec[1] is preserved
      expect(newSpec).toHaveLength(2);
      expect(newSpec[0]).toEqual(
        expect.objectContaining({
          question_name: 'new question',
          variable: 'question',
          type: 'text',
        })
      );
      expect(newSpec[1]).toEqual(survey.spec[1]);
    });

    test('should set formError', async () => {
      const realConsoleError = global.console.error;
      global.console.error = jest.fn();
      const err = new Error('oops');
      updateSurvey.mockImplementation(() => {
        throw err;
      });

      editAndSubmit('question');

      expect(await screen.findByText('oops')).toBeInTheDocument();
      global.console.error = realConsoleError;
    });

    test('should generate error for duplicate variable names', async () => {
      const realConsoleError = global.console.error;
      global.console.error = jest.fn();

      editAndSubmit('bar');

      expect(
        await screen.findByText(
          'Survey already contains a question with variable named “bar”'
        )
      ).toBeInTheDocument();
      expect(updateSurvey).not.toHaveBeenCalled();
      global.console.error = realConsoleError;
    });
  });

  describe('without question_variable present', () => {
    test('should redirect back to the survey list', async () => {
      history = createMemoryHistory({
        initialEntries: ['/templates/job_templates/1/survey/edit'],
      });
      updateSurvey = jest.fn();
      renderEdit(survey, history, updateSurvey);

      await waitFor(() =>
        expect(history.location.pathname).toEqual(
          '/templates/job_templates/1/survey'
        )
      );
    });
  });

  test('should handle multiplechoice as array', () => {
    const mcSurvey = {
      spec: [
        {
          question_name: 'What is the foo?',
          question_description: 'more about the foo',
          variable: 'foo',
          required: true,
          type: 'multiplechoice',
          choices: ['one', 'two', 'three'],
          default: '',
          min: 0,
          max: 1024,
        },
      ],
    };
    history = createMemoryHistory({
      initialEntries: [
        '/templates/job_templates/1/survey/edit?question_variable=foo',
      ],
    });
    updateSurvey = jest.fn();
    renderEdit(mcSurvey, history, updateSurvey);

    const inputs = document.querySelectorAll(
      '#formattedChoices input[type="text"]'
    );
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveValue('one');
    expect(inputs[1]).toHaveValue('two');
    expect(inputs[2]).toHaveValue('three');
  });

  test('should handle multiplechoice as string', () => {
    const mcSurvey = {
      spec: [
        {
          question_name: 'What is the foo?',
          question_description: 'more about the foo',
          variable: 'foo',
          required: true,
          type: 'multiplechoice',
          choices: 'one\ntwo\nthree',
          default: '',
          min: 0,
          max: 1024,
        },
      ],
    };
    history = createMemoryHistory({
      initialEntries: [
        '/templates/job_templates/1/survey/edit?question_variable=foo',
      ],
    });
    updateSurvey = jest.fn();
    renderEdit(mcSurvey, history, updateSurvey);

    const inputs = document.querySelectorAll(
      '#formattedChoices input[type="text"]'
    );
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveValue('one');
    expect(inputs[1]).toHaveValue('two');
    expect(inputs[2]).toHaveValue('three');
  });

  test('should handle multiselect as array', () => {
    const msSurvey = {
      spec: [
        {
          question_name: 'What is the foo?',
          question_description: 'more about the foo',
          variable: 'foo',
          required: true,
          type: 'multiselect',
          choices: ['one', 'two', 'three'],
          default: '',
          min: 0,
          max: 1024,
        },
      ],
    };
    history = createMemoryHistory({
      initialEntries: [
        '/templates/job_templates/1/survey/edit?question_variable=foo',
      ],
    });
    updateSurvey = jest.fn();
    renderEdit(msSurvey, history, updateSurvey);

    const inputs = document.querySelectorAll(
      '#formattedChoices input[type="text"]'
    );
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveValue('one');
    expect(inputs[1]).toHaveValue('two');
    expect(inputs[2]).toHaveValue('three');
  });

  test('should handle multiselect as string', () => {
    const msSurvey = {
      spec: [
        {
          question_name: 'What is the foo?',
          question_description: 'more about the foo',
          variable: 'foo',
          required: true,
          type: 'multiselect',
          choices: 'one\ntwo\nthree',
          default: '',
          min: 0,
          max: 1024,
        },
      ],
    };
    history = createMemoryHistory({
      initialEntries: [
        '/templates/job_templates/1/survey/edit?question_variable=foo',
      ],
    });
    updateSurvey = jest.fn();
    renderEdit(msSurvey, history, updateSurvey);

    const inputs = document.querySelectorAll(
      '#formattedChoices input[type="text"]'
    );
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveValue('one');
    expect(inputs[1]).toHaveValue('two');
    expect(inputs[2]).toHaveValue('three');
  });
});
