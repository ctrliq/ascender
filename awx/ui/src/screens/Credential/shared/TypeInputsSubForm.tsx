import type { CredentialType, Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { FormGroup, Title } from '@patternfly/react-core';
import {
  FormCheckboxLayout,
  FormColumnLayout,
  FormFullWidthLayout,
  SubFormLayout,
} from 'components/FormLayout';
import { CheckboxField } from 'components/FormField';
import { CredentialField, GceFileUploadField } from './CredentialFormFields';

export interface TypeInputsSubFormProps {
  credentialType: CredentialType;
  [key: string]: unknown;
}

function TypeInputsSubForm({ credentialType }: TypeInputsSubFormProps) {
  const { t } = useLingui();
  const stringFields = credentialType.inputs?.fields?.filter(
    (fieldOptions: Untyped) =>
      fieldOptions.type === 'string' || fieldOptions.choices
  );
  const booleanFields = credentialType.inputs?.fields?.filter(
    (fieldOptions: Untyped) => fieldOptions.type === 'boolean'
  );
  return (
    <SubFormLayout>
      <Title size="md" headingLevel="h4">
        {t`Type Details`}
      </Title>
      <FormColumnLayout>
        {credentialType.namespace === 'gce' && <GceFileUploadField />}
        {stringFields?.map((fieldOptions: Untyped) =>
          fieldOptions.multiline ? (
            <FormFullWidthLayout key={fieldOptions.id}>
              <CredentialField
                credentialType={credentialType}
                fieldOptions={fieldOptions}
              />
            </FormFullWidthLayout>
          ) : (
            <CredentialField
              key={fieldOptions.id}
              credentialType={credentialType}
              fieldOptions={fieldOptions}
            />
          )
        )}
        {(booleanFields?.length ?? 0) > 0 && (
          <FormFullWidthLayout>
            <FormGroup fieldId="credential-checkboxes" label={t`Options`}>
              <FormCheckboxLayout>
                {booleanFields?.map((fieldOptions: Untyped) => (
                  <CheckboxField
                    id={`credential-${fieldOptions.id}`}
                    key={fieldOptions.id}
                    name={`inputs.${fieldOptions.id}`}
                    label={fieldOptions.label}
                    tooltip={fieldOptions.help_text}
                  />
                ))}
              </FormCheckboxLayout>
            </FormGroup>
          </FormFullWidthLayout>
        )}
      </FormColumnLayout>
    </SubFormLayout>
  );
}

export default TypeInputsSubForm;
