import React from 'react';

import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import { CheckboxField } from '../FormField';
import Popover from '../Popover';

const FieldHeader = styled.div`
  display: flex;
  padding-bottom: var(--pf-c-form__group-label--PaddingBottom);
`;

const StyledCheckboxField = styled(CheckboxField)`
  --pf-c-check__label--FontSize: var(--pf-c-form__label--FontSize);
  margin-left: auto;
`;

function FieldWithPrompt({
  children,
  fieldId,
  isRequired = false,
  label,
  promptId,
  promptName,
  tooltip = null,
  isDisabled,
}) {
  const { t } = useLingui();
  return (
    <div className="pf-c-form__group" data-cy={`${fieldId}-form-group`}>
      <FieldHeader>
        <div>
          <label className="pf-c-form__label" htmlFor={fieldId}>
            <span className="pf-c-form__label-text">{label}</span>
            {isRequired && (
              <span className="pf-c-form__label-required" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {tooltip && <Popover content={tooltip} id={`${fieldId}-tooltip`} />}
        </div>
        <StyledCheckboxField
          isDisabled={isDisabled}
          id={promptId}
          label={t`Prompt on launch`}
          name={promptName}
          ouiaId={`${promptId}-checkbox`}
        />
      </FieldHeader>
      {children}
    </div>
  );
}

export default FieldWithPrompt;
