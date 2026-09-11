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
import { EncryptedField, InputField } from '../../shared/SharedFields';
import { RevertAllAlert, RevertFormActionGroup } from '../../shared';

function RADIUSEdit() {
  const navigate = useNavigate();
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request: fetchRadius,
    result: radius,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('radius');
      const mergedData: Record<string, Untyped> = {};
      Object.keys(data).forEach((key) => {
        mergedData[key] = { ...options[key], value: data[key] };
      });
      return mergedData;
    }, [options]),
    null
  );

  useEffect(() => {
    fetchRadius();
  }, [fetchRadius]);

  const { error: submitError, request: submitForm } = useRequest(
    useCallback(
      async (values: Untyped) => {
        await SettingsAPI.updateAll(values);
        navigate('/settings/radius/details');
      },
      [navigate]
    ),
    null
  );

  const { error: revertError, request: revertAll } = useRequest(
    useCallback(async () => {
      await SettingsAPI.revertCategory('radius');
    }, []),
    null
  );

  const handleSubmit = async (form: Untyped) => {
    await submitForm(form);
  };

  const handleRevertAll = async () => {
    await revertAll();

    closeModal();

    navigate('/settings/radius/details');
  };

  const handleCancel = () => {
    navigate('/settings/radius/details');
  };

  const initialValues = (fields: Untyped) =>
    Object.keys(fields).reduce(
      (acc, key) => {
        acc[key] = fields[key].value ?? '';
        return acc;
      },
      {} as Record<string, Untyped>
    );

  return (
    <CardBody>
      {Boolean(isLoading) && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && radius && (
        <Formik initialValues={initialValues(radius)} onSubmit={handleSubmit}>
          {(formik) => (
            <Form autoComplete="off" onSubmit={formik.handleSubmit}>
              <FormColumnLayout>
                <InputField
                  name="RADIUS_SERVER"
                  config={radius.RADIUS_SERVER}
                />
                <InputField name="RADIUS_PORT" config={radius.RADIUS_PORT} />
                <EncryptedField
                  name="RADIUS_SECRET"
                  config={radius.RADIUS_SECRET}
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

export default RADIUSEdit;
