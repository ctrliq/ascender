import type { CredentialType, Credential } from 'types/api';
import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';

import { Formik } from 'formik';
import { Button, Form, FormGroup } from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';
import { CredentialsAPI, CredentialTypesAPI } from 'api';
import AnsibleSelect from 'components/AnsibleSelect';
import FormField from 'components/FormField';
import { FormFullWidthLayout } from 'components/FormLayout';
import Popover from 'components/Popover';
import { required } from 'util/validators';
import useRequest from 'hooks/useRequest';
import { CredentialPluginTestAlert } from './CredentialPlugins';
import type { CredentialTestError } from './CredentialPlugins/CredentialPluginTestAlert';
import type { CredentialFormValues } from './CredentialForm';

export interface ExternalTestModalProps {
  credential?: Credential | null;
  credentialType: CredentialType;
  /** What the credential form holds, which the test is run against. */
  credentialFormValues: CredentialFormValues;
  onClose: () => void;
  [key: string]: unknown;
}

function ExternalTestModal({
  credential = null,
  credentialType,
  credentialFormValues,
  onClose,
}: ExternalTestModalProps) {
  const { t } = useLingui();
  const {
    result: testPluginSuccess,
    error: testPluginError,
    request: testPluginMetadata,
  } = useRequest(
    useCallback(
      async (values: Record<string, unknown>) => {
        const payload = {
          inputs: credentialType.inputs?.fields?.reduce(
            (filteredInputs: Record<string, unknown>, field) => {
              filteredInputs[field.id] = credentialFormValues.inputs[field.id];
              return filteredInputs;
            },
            {}
          ),
          metadata: values,
        };

        if (credential && credential.credential_type === credentialType.id) {
          return CredentialsAPI.test(credential.id, payload);
        }
        return CredentialTypesAPI.test(credentialType.id, payload);
      },
      [
        credential,
        credentialType.id,
        credentialType.inputs?.fields,
        credentialFormValues.inputs,
      ]
    ),
    null
  );

  const handleTest = async (values: Record<string, unknown>) => {
    await testPluginMetadata(values);
  };

  return (
    <>
      <Formik
        initialValues={(credentialType.inputs?.metadata ?? []).reduce(
          (initialValues: Record<string, unknown>, field) => {
            if (field.type === 'string' && field.choices) {
              initialValues[field.id] = field.default || field.choices[0];
            } else {
              initialValues[field.id] = '';
            }
            return initialValues;
          },
          {}
        )}
        onSubmit={(values) => handleTest(values)}
      >
        {({ handleSubmit, setFieldValue, values }) => (
          <Modal
            title={t`Test External Credential`}
            isOpen
            onClose={() => onClose()}
            variant="small"
            actions={[
              <Button
                ouiaId="external-test-modal-run-button"
                id="run-external-credential-test"
                key="confirm"
                variant="primary"
                onClick={() => handleSubmit()}
              >
                {t`Run`}
              </Button>,
              <Button
                ouiaId="external-test-modal-cancel-button"
                id="cancel-external-credential-test"
                key="cancel"
                variant="link"
                onClick={() => onClose()}
              >
                {t`Cancel`}
              </Button>,
            ]}
          >
            <Form autoComplete="off">
              <FormFullWidthLayout>
                {(credentialType.inputs?.metadata ?? []).map((field) => {
                  const isRequired = credentialType.inputs?.required?.includes(
                    field.id
                  );
                  if (field.type === 'string') {
                    if (field.choices) {
                      return (
                        <FormGroup
                          key={field.id}
                          fieldId={`credential-${field.id}`}
                          label={field.label}
                          labelHelp={
                            field.help_text ? (
                              <Popover content={field.help_text} />
                            ) : undefined
                          }
                          isRequired={isRequired}
                        >
                          <AnsibleSelect
                            name={field.id}
                            // The form's value, not the field's default: bound
                            // to the default this select showed it whatever the
                            // user picked, while the form held the choice.
                            value={values[field.id] as string}
                            id={`credential-${field.id}`}
                            data={(field.choices ?? []).map((choice) => ({
                              value: choice,
                              key: choice,
                              label: choice,
                            }))}
                            onChange={(event, value) => {
                              setFieldValue(field.id, value);
                            }}
                          />
                        </FormGroup>
                      );
                    }

                    return (
                      <FormField
                        key={field.id}
                        id={`credential-${field.id}`}
                        label={field.label}
                        tooltip={field.help_text}
                        name={field.id}
                        type={field.multiline ? 'textarea' : 'text'}
                        isRequired={isRequired}
                        validate={isRequired ? required(null) : null}
                      />
                    );
                  }

                  return null;
                })}
              </FormFullWidthLayout>
            </Form>
          </Modal>
        )}
      </Formik>
      <CredentialPluginTestAlert
        credentialName={credentialFormValues.name}
        successResponse={testPluginSuccess}
        errorResponse={testPluginError as CredentialTestError}
      />
    </>
  );
}

export default ExternalTestModal;
