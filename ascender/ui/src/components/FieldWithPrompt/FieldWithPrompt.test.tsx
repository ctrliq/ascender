import React from 'react';
import { screen } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import FieldWithPrompt from './FieldWithPrompt';

describe('FieldWithPrompt', () => {
  test('Required asterisk and Popover hidden when not required and tooltip not provided', () => {
    const { container } = renderWithContexts(
      <FormRoot
        onSubmit={() => {}}
        initialValues={{
          ask_limit_on_launch: false,
          limit: '',
        }}
      >
        {() => (
          <FieldWithPrompt
            fieldId="job-template-limit"
            label="Limit"
            promptId="job-template-ask-limit-on-launch"
            promptName="ask_limit_on_launch"
          >
            <input id="job-template-limit" name="limit" type="text" />
          </FieldWithPrompt>
        )}
      </FormRoot>
    );

    // the prompt-on-launch checkbox is always rendered
    expect(screen.getByLabelText('Prompt on launch')).toBeInTheDocument();
    // no required asterisk
    expect(
      container.querySelector('.pf-v6-c-form__label-required')
    ).not.toBeInTheDocument();
    // no tooltip Popover trigger
    expect(
      screen.queryByRole('button', { name: 'More information' })
    ).not.toBeInTheDocument();
  });

  test('Required asterisk and Popover shown when required and tooltip provided', () => {
    const { container } = renderWithContexts(
      <FormRoot
        onSubmit={() => {}}
        initialValues={{
          ask_limit_on_launch: false,
          limit: '',
        }}
      >
        {() => (
          <FieldWithPrompt
            fieldId="job-template-limit"
            label="Limit"
            promptId="job-template-ask-limit-on-launch"
            promptName="ask_limit_on_launch"
            tooltip="Help text"
            isRequired
          >
            <input id="job-template-limit" name="limit" type="text" />
          </FieldWithPrompt>
        )}
      </FormRoot>
    );

    expect(screen.getByLabelText('Prompt on launch')).toBeInTheDocument();
    // required asterisk present
    expect(
      container.querySelector('.pf-v6-c-form__label-required')
    ).toBeInTheDocument();
    // the tooltip Popover renders its trigger button
    expect(
      screen.getByRole('button', { name: 'More information' })
    ).toBeInTheDocument();
  });
});
