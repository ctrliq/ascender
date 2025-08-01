import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { FormGroup, Title } from '@patternfly/react-core';
import {
  FormCheckboxLayout,
  FormColumnLayout,
  FormFullWidthLayout,
  SubFormLayout,
} from 'components/FormLayout';
import { CheckboxField } from 'components/FormField';
import { CredentialType } from 'types';
import { CredentialField, GceFileUploadField } from './CredentialFormFields';

function TypeInputsSubForm({ credentialType }) {
  const { i18n } = useLingui();
  const stringFields = credentialType.inputs.fields.filter(
    (fieldOptions) => fieldOptions.type === 'string' || fieldOptions.choices
  );
  const booleanFields = credentialType.inputs.fields.filter(
    (fieldOptions) => fieldOptions.type === 'boolean'
  );
  return (
    <SubFormLayout>
      <Title size="md" headingLevel="h4">
        {i18n._(msg`Type Details`)}
      </Title>
      <FormColumnLayout>
        {credentialType.namespace === 'gce' && <GceFileUploadField />}
        {stringFields.map((fieldOptions) =>
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
        {booleanFields.length > 0 && (
          <FormFullWidthLayout>
            <FormGroup
              fieldId="credential-checkboxes"
              label={i18n._(msg`Options`)}
            >
              <FormCheckboxLayout>
                {booleanFields.map((fieldOptions) => (
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

TypeInputsSubForm.propTypes = {
  credentialType: CredentialType.isRequired,
};

TypeInputsSubForm.defaultProps = {};

export default TypeInputsSubForm;
