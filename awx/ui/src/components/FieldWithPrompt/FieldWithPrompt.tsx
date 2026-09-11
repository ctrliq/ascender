import type { Untyped } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import { CheckboxField } from '../FormField';
import Popover from '../Popover';

const FieldHeader = styled.div`
  display: flex;
  padding-bottom: var(--pf-v6-c-form__group-label--PaddingBottom);
`;

const StyledCheckboxField = styled(CheckboxField)`
  --pf-v6-c-check__label--FontSize: var(--pf-v6-c-form__label--FontSize);
  margin-left: auto;
`;

export interface FieldWithPromptProps {
  children: React.ReactNode;
  fieldId: string;
  isRequired?: boolean;
  label: React.ReactNode;
  promptId: number | string;
  promptName: Untyped;
  tooltip?: Untyped;
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
      <FieldHeader>
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
