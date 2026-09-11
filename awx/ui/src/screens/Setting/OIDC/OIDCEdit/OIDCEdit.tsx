import type { Untyped } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Formik } from 'formik';
import { Form } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { FormSubmitError } from 'components/FormField';
import { FormColumnLayout } from 'components/FormLayout';
import { useSettings } from 'contexts/Settings';
import useModal from 'hooks/useModal';
import useRequest from 'hooks/useRequest';
import { SettingsAPI } from 'api';
import { RevertAllAlert, RevertFormActionGroup } from '../../shared';
import {
  EncryptedField,
  InputField,
  BooleanField,
} from '../../shared/SharedFields';

function OIDCEdit() {
  const navigate = useNavigate();
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request: fetchOIDC,
    result: OIDC,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('oidc');
      const mergedData: Record<string, Untyped> = {};
      Object.keys(data).forEach((key) => {
        if (!options[key]) {
          return;
        }
        mergedData[key] = { ...options[key], value: data[key] };
      });
      return mergedData;
    }, [options]),
    null
  );

  useEffect(() => {
    fetchOIDC();
  }, [fetchOIDC]);

  const { error: submitError, request: submitForm } = useRequest(
    useCallback(
      async (values: Untyped) => {
        await SettingsAPI.updateAll(values);
        navigate('/settings/oidc/details');
      },
      [navigate]
    ),
    null
  );

  const { error: revertError, request: revertAll } = useRequest(
    useCallback(async () => {
      await SettingsAPI.revertCategory('oidc');
    }, []),
    null
  );

  const handleSubmit = async (form: Untyped) => {
    await submitForm({
      ...form,
    });
  };

  const handleRevertAll = async () => {
    await revertAll();

    closeModal();

    navigate('/settings/oidc/details');
  };

  const handleCancel = () => {
    navigate('/settings/oidc/details');
  };

  const initialValues = (fields: Untyped) =>
    Object.keys(fields).reduce(
      (acc, key) => {
        if (
          fields[key].type === 'list' ||
          fields[key].type === 'nested object'
        ) {
          acc[key] = fields[key].value
            ? JSON.stringify(fields[key].value, null, 2)
            : null;
        } else {
          acc[key] = fields[key].value ?? '';
        }
        return acc;
      },
      {} as Record<string, Untyped>
    );

  return (
    <CardBody>
      {Boolean(isLoading) && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && OIDC && (
        <Formik initialValues={initialValues(OIDC)} onSubmit={handleSubmit}>
          {(formik) => (
            <Form autoComplete="off" onSubmit={formik.handleSubmit}>
              <FormColumnLayout>
                <InputField
                  name="SOCIAL_AUTH_OIDC_KEY"
                  config={OIDC.SOCIAL_AUTH_OIDC_KEY}
                />
                <EncryptedField
                  name="SOCIAL_AUTH_OIDC_SECRET"
                  config={OIDC.SOCIAL_AUTH_OIDC_SECRET}
                />
                <InputField
                  name="SOCIAL_AUTH_OIDC_OIDC_ENDPOINT"
                  config={OIDC.SOCIAL_AUTH_OIDC_OIDC_ENDPOINT}
                  type="url"
                />
                <BooleanField
                  name="SOCIAL_AUTH_OIDC_VERIFY_SSL"
                  config={OIDC.SOCIAL_AUTH_OIDC_VERIFY_SSL}
                />
                {Boolean(submitError) && (
                  <FormSubmitError error={submitError} />
                )}
                {Boolean(revertError) && (
                  <FormSubmitError error={revertError} />
                )}
              </FormColumnLayout>
              <RevertFormActionGroup
                onCancel={handleCancel}
                onSubmit={formik.handleSubmit}
                onRevert={toggleModal}
              />
              {isModalOpen && (
                <RevertAllAlert
                  onClose={closeModal}
                  onRevertAll={handleRevertAll}
                />
              )}
            </Form>
          )}
        </Formik>
      )}
    </CardBody>
  );
}

export default OIDCEdit;
