import React, { useCallback } from 'react';
import { Formik, useField } from 'formik';
import { useLingui } from '@lingui/react/macro';
import {
	Button,
	Tooltip
} from '@patternfly/react-core';
import {
	Wizard,
	WizardContextConsumer,
	WizardFooter
} from '@patternfly/react-core/deprecated';
import { CredentialsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import CredentialsStep from './CredentialsStep';
import MetadataStep from './MetadataStep';
import { CredentialPluginTestAlert } from '..';

function CredentialPluginWizard({ handleSubmit, onClose }) {
  const { t } = useLingui();
  const [selectedCredential] = useField('credential');
  const [inputValues] = useField('inputs');

  const {
    result: testPluginSuccess,
    error: testPluginError,
    request: testPluginMetadata,
  } = useRequest(
    useCallback(
      async () =>
        CredentialsAPI.test(selectedCredential.value.id, {
          metadata: inputValues.value,
        }),
      [selectedCredential, inputValues]
    ),
    null
  );

  const steps = [
    {
      id: 1,
      name: t`Credential`,
      key: 'credential',
      component: <CredentialsStep />,
      enableNext: !!selectedCredential.value,
    },
    {
      id: 2,
      name: t`Metadata`,
      key: 'metadata',
      component: <MetadataStep />,
      canJumpTo: !!selectedCredential.value,
    },
  ];

  const CustomFooter = (
    <WizardFooter>
      <WizardContextConsumer>
        {({ activeStep, onNext, onBack }) => (
          <>
            <Button
              ouiaId="credential-plugin-prompt-next"
              id="credential-plugin-prompt-next"
              variant="primary"
              onClick={onNext}
              isDisabled={!selectedCredential.value}
            >
              {activeStep.key === 'metadata'
                ? t`OK`
                : t`Next`}
            </Button>
            {activeStep && activeStep.key === 'metadata' && (
              <>
                <Tooltip
                  content={t`Click this button to verify connection to the secret management system using the selected credential and specified inputs.`}
                  position="right"
                >
                  <Button
                    ouiaId="credential-plugin-prompt-test"
                    id="credential-plugin-prompt-test"
                    variant="secondary"
                    onClick={() => testPluginMetadata()}
                  >
                    {t`Test`}
                  </Button>
                </Tooltip>

                <Button
                  ouiaId="credential-plugin-prompt-back"
                  id="credential-plugin-prompt-back"
                  variant="secondary"
                  onClick={onBack}
                >
                  {t`Back`}
                </Button>
              </>
            )}
            <Button
              ouiaId="credential-plugin-prompt-cancel"
              id="credential-plugin-prompt-cancel"
              variant="link"
              onClick={onClose}
            >
              {t`Cancel`}
            </Button>
          </>
        )}
      </WizardContextConsumer>
    </WizardFooter>
  );

  return (
    <>
      <Wizard
        isOpen
        onClose={onClose}
        title={t`External Secret Management System`}
        steps={steps}
        onSave={handleSubmit}
        footer={CustomFooter}
      />
      {selectedCredential.value && (
        <CredentialPluginTestAlert
          credentialName={selectedCredential.value.name}
          successResponse={testPluginSuccess}
          errorResponse={testPluginError}
        />
      )}
    </>
  );
}

function CredentialPluginPrompt({ onClose, onSubmit, initialValues = {} }) {
  return (
    <Formik
      initialValues={{
        credential: initialValues?.credential || null,
        inputs: initialValues?.inputs || {},
      }}
      onSubmit={onSubmit}
    >
      {({ handleSubmit }) => (
        <CredentialPluginWizard handleSubmit={handleSubmit} onClose={onClose} />
      )}
    </Formik>
  );
}

export default CredentialPluginPrompt;
