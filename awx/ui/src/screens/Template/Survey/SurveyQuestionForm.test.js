import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SurveyQuestionForm from './SurveyQuestionForm';

const question = {
  question_name: 'What is the foo?',
  question_description: 'more about the foo',
  variable: 'foo',
  required: true,
  type: 'text',
  min: 0,
  max: 1024,
};

const noop = () => {};

// Drive the real AnsibleSelect (a PF FormSelect <select>) to change the
// question type, then wait for the type-dependent fields to (re)render.
function selectType(type) {
  const select = document.querySelector('#question-type');
  fireEvent.change(select, { target: { value: type } });
}

describe('<SurveyQuestionForm />', () => {
  test('should render form', () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );

    expect(document.querySelector('#question-name')).toHaveValue(
      question.question_name
    );
    expect(document.querySelector('#question-description')).toHaveValue(
      question.question_description
    );
    expect(document.querySelector('#question-variable')).toHaveValue(
      question.variable
    );
    expect(document.querySelector('#question-required')).toBeChecked();
    expect(document.querySelector('#question-type')).toHaveValue(question.type);
  });

  test('should provide fields for text question', () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );

    expect(document.querySelector('#question-min')).toHaveAttribute(
      'type',
      'number'
    );
    expect(document.querySelector('#question-max')).toHaveAttribute(
      'type',
      'number'
    );
    expect(document.querySelector('#question-default')).toHaveAttribute(
      'type',
      'text'
    );
  });

  test('should provide fields for textarea question', async () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );
    selectType('textarea');

    expect(document.querySelector('#question-min')).toHaveAttribute(
      'type',
      'number'
    );
    expect(document.querySelector('#question-max')).toHaveAttribute(
      'type',
      'number'
    );
    await waitFor(() =>
      expect(document.querySelector('textarea#question-default')).toBeInTheDocument()
    );
  });

  test('should provide fields for password question', async () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );
    selectType('password');

    expect(document.querySelector('#question-min')).toHaveAttribute(
      'type',
      'number'
    );
    expect(document.querySelector('#question-max')).toHaveAttribute(
      'type',
      'number'
    );
    await waitFor(() =>
      expect(document.querySelector('#question-default')).toHaveAttribute(
        'type',
        'password'
      )
    );
  });

  test('should provide fields for multiple choice question', async () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );
    selectType('multiplechoice');

    await screen.findByText('Multiple Choice Options');
    // exactly one empty-choice text input and one default-toggle button
    expect(
      screen.getAllByRole('textbox', { name: 'new choice' })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Click to toggle default value' })
    ).toHaveLength(1);
  });

  test('should provide fields for multi-select question', async () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );
    selectType('multiselect');

    await screen.findByText('Multiple Choice Options');
    expect(
      screen.getAllByRole('textbox', { name: 'new choice' })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Click to toggle default value' })
    ).toHaveLength(1);
  });

  test('should provide fields for integer question', async () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );
    selectType('integer');

    expect(document.querySelector('#question-min')).toHaveAttribute(
      'type',
      'number'
    );
    expect(document.querySelector('#question-max')).toHaveAttribute(
      'type',
      'number'
    );
    await waitFor(() =>
      expect(document.querySelector('#question-default')).toHaveAttribute(
        'type',
        'number'
      )
    );
  });

  test('should provide fields for float question', async () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );
    selectType('float');

    expect(document.querySelector('#question-min')).toHaveAttribute(
      'type',
      'number'
    );
    expect(document.querySelector('#question-max')).toHaveAttribute(
      'type',
      'number'
    );
    await waitFor(() =>
      expect(document.querySelector('#question-default')).toHaveAttribute(
        'type',
        'number'
      )
    );
  });

  // The default-toggle renders a styled CheckIcon whose `selected` prop drives
  // a styled-components class. In the real DOM we proxy that prop by asserting
  // the icon's class changes when toggled.
  const toggleButton = (choice) =>
    document.querySelector(`[data-ouia-component-id="${choice}-button"]`);
  const iconClass = (choice) =>
    toggleButton(choice).querySelector('svg').getAttribute('class');

  test('should activate default values, multiselect', async () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );
    selectType('multiselect');
    await screen.findByText('Multiple Choice Options');

    const firstInput = screen.getByRole('textbox', { name: 'new choice' });
    fireEvent.change(firstInput, { target: { value: 'alex' } });

    // not selected yet
    const alexUnselected = iconClass('alex');
    fireEvent.click(toggleButton('alex'));
    await waitFor(() =>
      expect(iconClass('alex')).not.toEqual(alexUnselected)
    );
    const alexSelected = iconClass('alex');

    // adding a new choice via Enter on the last (alex) input
    fireEvent.keyUp(screen.getByRole('textbox', { name: 'alex' }), {
      key: 'Enter',
    });
    await waitFor(() =>
      expect(
        document.querySelectorAll('#formattedChoices .pf-v6-c-input-group')
      ).toHaveLength(2)
    );

    const secondInput = screen.getByRole('textbox', { name: 'new choice' });
    fireEvent.change(secondInput, { target: { value: 'spencer' } });
    await waitFor(() =>
      expect(
        document.querySelectorAll('#formattedChoices .pf-v6-c-input-group')
      ).toHaveLength(2)
    );

    fireEvent.click(toggleButton('spencer'));
    await waitFor(() =>
      expect(iconClass('spencer')).toEqual(alexSelected)
    );

    // multiselect keeps multiple defaults; toggling alex back off
    fireEvent.click(toggleButton('alex'));
    await waitFor(() => expect(iconClass('alex')).toEqual(alexUnselected));
    // spencer stays selected
    expect(iconClass('spencer')).toEqual(alexSelected);
  });

  test('should select default, multiplechoice', async () => {
    renderWithContexts(
      <SurveyQuestionForm
        question={question}
        handleSubmit={noop}
        handleCancel={noop}
      />
    );
    selectType('multiplechoice');
    await screen.findByText('Multiple Choice Options');

    const firstInput = screen.getByRole('textbox', { name: 'new choice' });
    fireEvent.change(firstInput, { target: { value: 'alex' } });

    const alexUnselected = iconClass('alex');
    fireEvent.click(toggleButton('alex'));
    await waitFor(() =>
      expect(iconClass('alex')).not.toEqual(alexUnselected)
    );
    const alexSelected = iconClass('alex');
    expect(
      document.querySelectorAll('#formattedChoices .pf-v6-c-input-group')
    ).toHaveLength(1);

    fireEvent.keyUp(screen.getByRole('textbox', { name: 'alex' }), {
      key: 'Enter',
    });
    await waitFor(() =>
      expect(
        document.querySelectorAll('#formattedChoices .pf-v6-c-input-group')
      ).toHaveLength(2)
    );

    const secondInput = screen.getByRole('textbox', { name: 'new choice' });
    fireEvent.change(secondInput, { target: { value: 'spencer' } });
    await waitFor(() =>
      expect(
        document.querySelectorAll('#formattedChoices .pf-v6-c-input-group')
      ).toHaveLength(2)
    );

    fireEvent.click(toggleButton('spencer'));
    // multiplechoice is single-select: spencer becomes the default, alex clears
    await waitFor(() => expect(iconClass('spencer')).toEqual(alexSelected));
    expect(iconClass('alex')).toEqual(alexUnselected);
  });
});
