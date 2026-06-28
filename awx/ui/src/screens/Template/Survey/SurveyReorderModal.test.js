import React from 'react';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import SurveyReorderModal from './SurveyReorderModal';

const questions = [
  {
    question_name: 'Text Question',
    question_description: '',
    required: true,
    type: 'text',
    variable: 'dfgh',
    min: 0,
    max: 1024,
    default: 'Text Question Value',
    choices: '',
  },
  {
    question_name: 'Select Question',
    question_description: '',
    required: true,
    type: 'multiplechoice',
    variable: 'sdf',
    min: null,
    max: null,
    default: 'Select Question Value',
    choices: 'a\nd\nc',
  },
  {
    question_name: 'Text Area Question',
    question_description: '',
    required: true,
    type: 'textarea',
    variable: 'b',
    min: 0,
    max: 4096,
    default: 'Text Area Question Value',
    choices: '',
  },
  {
    question_name: 'Password Question',
    question_description: '',
    required: true,
    type: 'password',
    variable: 'c',
    min: 0,
    max: 32,
    default: '$encrypted$',
    choices: '',
  },
  {
    question_name: 'Multiple select Question',
    question_description: '',
    required: true,
    type: 'multiselect',
    variable: 'a',
    min: null,
    max: null,
    default: 'a\nc\nd\nb',
    choices: 'a\nc\nd\nb',
  },
];

describe('<SurveyReorderModal />', () => {
  test('Renders proper fields', () => {
    renderWithContexts(
      <SurveyReorderModal questions={questions} isOrderModalOpen />
    );

    // Modal renders into a body portal; query via screen/document.
    expect(screen.getByText('Survey Question Order')).toBeInTheDocument();

    // Question 1: text input, disabled, with the default value.
    expect(screen.getByText('Text Question')).toBeInTheDocument();
    const question1Value = document.querySelector(
      '#survey-preview-text-dfgh'
    );
    expect(question1Value).toBeInTheDocument();
    expect(question1Value).toHaveValue('Text Question Value');
    expect(question1Value).toBeDisabled();

    // Question 2: multiple choice Select, disabled, placeholder is the default.
    expect(screen.getByText('Select Question')).toBeInTheDocument();
    const question2Toggle = document.querySelector(
      '[data-ouia-component-id="survey-preview-multipleChoice-sdf"]'
    );
    expect(question2Toggle).toBeInTheDocument();
    expect(
      within(question2Toggle).getByText('Select Question Value')
    ).toBeInTheDocument();
    expect(question2Toggle).toBeDisabled();

    // Question 3: textarea, disabled, with the default value.
    expect(screen.getByText('Text Area Question')).toBeInTheDocument();
    const question3Value = document.querySelector('textarea');
    expect(question3Value).toBeInTheDocument();
    expect(question3Value).toHaveValue('Text Area Question Value');
    expect(question3Value).toBeDisabled();

    // Question 4: password renders an ENCRYPTED span.
    expect(screen.getByText('Password Question')).toBeInTheDocument();
    const question4Value = document.querySelector('#survey-preview-encrypted');
    expect(question4Value).toBeInTheDocument();
    expect(question4Value).toHaveTextContent('ENCRYPTED');

    // Question 5: multiselect renders the selections as Labels (4 values).
    expect(screen.getByText('Multiple select Question')).toBeInTheDocument();
    const multiSelectToggle = document.querySelector(
      '[data-ouia-component-id="survey-preview-multiSelect-a"]'
    );
    expect(multiSelectToggle).toBeInTheDocument();
    const toggleWrapper = multiSelectToggle.closest('.pf-v6-c-menu-toggle');
    const labels = toggleWrapper.querySelectorAll('.pf-v6-c-label');
    expect(labels.length).toBe(4);
    expect(toggleWrapper).toHaveClass('pf-m-disabled');
  });

  test('Save and Cancel buttons wire up their callbacks', () => {
    const onSave = jest.fn();
    const onCloseOrderModal = jest.fn();
    renderWithContexts(
      <SurveyReorderModal
        questions={questions}
        isOrderModalOpen
        onSave={onSave}
        onCloseOrderModal={onCloseOrderModal}
      />
    );

    fireEvent.click(
      document.querySelector('[data-ouia-component-id="survey-order-save"]')
    );
    expect(onSave).toHaveBeenCalledWith(questions);

    fireEvent.click(
      document.querySelector('[data-ouia-component-id="survey-order-cancel"]')
    );
    expect(onCloseOrderModal).toHaveBeenCalled();
  });

  test('reorders questions via drag and drop', () => {
    const onSave = jest.fn();
    renderWithContexts(
      <SurveyReorderModal
        questions={questions}
        isOrderModalOpen
        onSave={onSave}
      />
    );

    const rows = document.querySelectorAll('[data-ouia-component-id^="survey-order-row-"]');
    const firstRow = rows[0];
    const thirdRow = rows[2];

    fireEvent.dragStart(firstRow, {
      dataTransfer: { effectAllowed: '' },
    });
    fireEvent.dragOver(thirdRow);

    fireEvent.click(
      document.querySelector('[data-ouia-component-id="survey-order-save"]')
    );

    const reordered = onSave.mock.calls[0][0];
    expect(reordered[0].question_name).toBe('Select Question');
    expect(reordered[1].question_name).toBe('Text Area Question');
    expect(reordered[2].question_name).toBe('Text Question');
  });
});
