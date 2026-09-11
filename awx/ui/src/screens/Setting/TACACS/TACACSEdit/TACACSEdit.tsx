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
import {
  BooleanField,
  ChoiceField,
  EncryptedField,
  InputField,
} from '../../shared/SharedFields';
import { RevertAllAlert, RevertFormActionGroup } from '../../shared';

function TACACSEdit() {
  const navigate = useNavigate();
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options } = useSettings();

  const {
    isLoading,
    error,
    request: fetchTACACS,
    result: tacacs,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('tacacsplus');
      const mergedData: Record<string, Untyped> = {};
      Object.keys(data).forEach((key) => {
        mergedData[key] = options[key];
        mergedData[key].value = data[key];
      });
      return mergedData;
    }, [options]),
    null
  );

  useEffect(() => {
    fetchTACACS();
  }, [fetchTACACS]);

  const { error: submitError, request: submitForm } = useRequest(
    useCallback(
      async (values: Untyped) => {
        await SettingsAPI.updateAll(values);
        navigate('/settings/tacacs/details');
      },
      [navigate]
    ),
    null
  );

  const { error: revertError, request: revertAll } = useRequest(
    useCallback(async () => {
      await SettingsAPI.revertCategory('tacacsplus');
    }, []),
    null
  );

  const handleSubmit = async (form: Untyped) => {
    await submitForm(form);
  };

  const handleRevertAll = async () => {
    await revertAll();

    closeModal();

    navigate('/settings/tacacs/details');
  };

  const handleCancel = () => {
    navigate('/settings/tacacs/details');
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
      {!isLoading && tacacs && (
        <Formik initialValues={initialValues(tacacs)} onSubmit={handleSubmit}>
          {(formik) => (
            <Form autoComplete="off" onSubmit={formik.handleSubmit}>
              <FormColumnLayout>
                <InputField
                  name="TACACSPLUS_HOST"
                  config={tacacs.TACACSPLUS_HOST}
                />
                <InputField
                  name="TACACSPLUS_PORT"
                  config={tacacs.TACACSPLUS_PORT}
                  type="number"
                />
                <EncryptedField
                  name="TACACSPLUS_SECRET"
                  config={tacacs.TACACSPLUS_SECRET}
                />
                <InputField
                  name="TACACSPLUS_SESSION_TIMEOUT"
                  config={tacacs.TACACSPLUS_SESSION_TIMEOUT}
                  type="number"
                />
                <ChoiceField
                  name="TACACSPLUS_AUTH_PROTOCOL"
                  config={tacacs.TACACSPLUS_AUTH_PROTOCOL}
                />
                <BooleanField
                  name="TACACSPLUS_REM_ADDR"
                  config={tacacs.TACACSPLUS_REM_ADDR}
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

export default TACACSEdit;
