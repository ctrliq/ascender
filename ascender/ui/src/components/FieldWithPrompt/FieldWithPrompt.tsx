import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { CheckboxField } from '../FormField';
import Popover from '../Popover';
import './FieldWithPrompt.css';

export interface FieldWithPromptProps {
  children: React.ReactNode;
  fieldId: string;
  isRequired?: boolean;
  label: React.ReactNode;
  promptId: string;
  promptName: string;
  tooltip?: React.ReactNode;
  isDisabled?: boolean;
  [key: string]: unknown;
}

function FieldWithPrompt({
  children,
  fieldId,
  isRequired = false,
  label,
  promptId,
  promptName,
  tooltip,
  isDisabled,
}: FieldWithPromptProps) {
  const { t } = useLingui();
  return (
    <div className="pf-v6-c-form__group" data-cy={`${fieldId}-form-group`}>
      <div className="ascender-field-with-prompt__header">
        <div>
          <label className="pf-v6-c-form__label" htmlFor={fieldId}>
            <span className="pf-v6-c-form__label-text">{label}</span>
            {isRequired && (
              <span className="pf-v6-c-form__label-required" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {tooltip && <Popover content={tooltip} id={`${fieldId}-tooltip`} />}
        </div>
        <CheckboxField
          className="ascender-field-with-prompt__styled-checkbox-field"
          isDisabled={isDisabled}
          id={promptId}
          label={t`Prompt on launch`}
          name={promptName}
          ouiaId={`${promptId}-checkbox`}
        />
      </div>
      {children}
    </div>
  );
}

export default FieldWithPrompt;
