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
  RevertAllAlert,
  RevertFormActionGroup,
} from '../../shared';

function TroubleshootingEdit() {
  const navigate = useNavigate();
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options } = useSettings();

  const {
    isLoading,
    error,
    request: fetchJobs,
    result: debug,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('debug');
      const { ...debugData } = data;
      const mergedData = {};
      Object.keys(debugData).forEach((key) => {
        if (!options[key]) {
          return;
        }
        mergedData[key] = options[key];
        mergedData[key].value = debugData[key];
      });

      return mergedData;
    }, [options]),
    null
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const { error: submitError, request: submitForm } = useRequest(
    useCallback(
      async (values) => {
        await SettingsAPI.updateAll(values);
        navigate('/settings/troubleshooting/details');
      },
      [navigate]
    ),
    null
  );

  const { error: revertError, request: revertAll } = useRequest(
    useCallback(async () => {
      await SettingsAPI.revertCategory('debug');
    }, []),
    null
  );

  const handleSubmit = async (form) => {
    await submitForm({
      ...form,
    });
  };

  const handleRevertAll = async () => {
    await revertAll();

    closeModal();

    navigate('/settings/troubleshooting/details');
  };

  const handleCancel = () => {
    navigate('/settings/troubleshooting/details');
  };

  const initialValues = (fields) =>
    Object.keys(fields).reduce((acc, key) => {
      if (fields[key].type === 'list' || fields[key].type === 'nested object') {
        acc[key] = fields[key].value
          ? JSON.stringify(fields[key].value, null, 2)
          : null;
      } else {
        acc[key] = fields[key].value ?? '';
      }
      return acc;
    }, {});
  return (
    <CardBody>
      {isLoading && <ContentLoading />}
      {!isLoading && error && <ContentError error={error} />}
      {!isLoading && debug && (
        <Formik initialValues={initialValues(debug)} onSubmit={handleSubmit}>
          {(formik) => (
            <Form autoComplete="off" onSubmit={formik.handleSubmit}>
              <FormColumnLayout>
                <BooleanField
                  name="AWX_CLEANUP_PATHS"
                  config={debug.AWX_CLEANUP_PATHS}
                />
                <BooleanField
                  name="AWX_REQUEST_PROFILE"
                  config={debug.AWX_REQUEST_PROFILE}
                />
                <BooleanField
                  name="RECEPTOR_RELEASE_WORK"
                  config={debug.RECEPTOR_RELEASE_WORK}
                />
                {submitError && <FormSubmitError error={submitError} />}
                {revertError && <FormSubmitError error={revertError} />}
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

export default TroubleshootingEdit;
