import React, { useCallback } from 'react';
import { func, shape } from 'prop-types';
import { Formik, useField } from 'formik';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import {
  Button,
  Tooltip,
  Wizard,
  WizardContextConsumer,
  WizardFooter,
} from '@patternfly/react-core';
import { CredentialsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import CredentialsStep from './CredentialsStep';
import MetadataStep from './MetadataStep';
import { CredentialPluginTestAlert } from '..';

function CredentialPluginWizard({ handleSubmit, onClose }) {
  const { i18n } = useLingui();
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
      name: i18n._(msg`Credential`),
      key: 'credential',
      component: <CredentialsStep />,
      enableNext: !!selectedCredential.value,
    },
    {
      id: 2,
      name: i18n._(msg`Metadata`),
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
                ? i18n._(msg`OK`)
                : i18n._(msg`Next`)}
            </Button>
            {activeStep && activeStep.key === 'metadata' && (
              <>
                <Tooltip
                  content={i18n._(
                    msg`Click this button to verify connection to the secret management system using the selected credential and specified inputs.`
                  )}
                  position="right"
                >
                  <Button
                    ouiaId="credential-plugin-prompt-test"
                    id="credential-plugin-prompt-test"
                    variant="secondary"
                    onClick={() => testPluginMetadata()}
                  >
                    {i18n._(msg`Test`)}
                  </Button>
                </Tooltip>

                <Button
                  ouiaId="credential-plugin-prompt-back"
                  id="credential-plugin-prompt-back"
                  variant="secondary"
                  onClick={onBack}
                >
                  {i18n._(msg`Back`)}
                </Button>
              </>
            )}
            <Button
              ouiaId="credential-plugin-prompt-cancel"
              id="credential-plugin-prompt-cancel"
              variant="link"
              onClick={onClose}
            >
              {i18n._(msg`Cancel`)}
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
        title={i18n._(msg`External Secret Management System`)}
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

function CredentialPluginPrompt({ onClose, onSubmit, initialValues }) {
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

CredentialPluginPrompt.propTypes = {
  onClose: func.isRequired,
  onSubmit: func.isRequired,
  initialValues: shape({}),
};

CredentialPluginPrompt.defaultProps = {
  initialValues: {},
};

export default CredentialPluginPrompt;
