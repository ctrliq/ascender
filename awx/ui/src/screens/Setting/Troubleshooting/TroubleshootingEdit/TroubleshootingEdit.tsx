import type { SettingConfig } from 'types/api';
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
  const { PUT: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request: fetchJobs,
    result: debug,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('debug');
      const { ...debugData } = data;
      const mergedData: Record<string, SettingConfig> = {};
      Object.keys(debugData).forEach((key) => {
        if (!options[key]) {
          return;
        }
        mergedData[key] = { ...options[key], value: debugData[key] };
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
      async (values: Record<string, unknown>) => {
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

  const handleSubmit = async (form: Record<string, unknown>) => {
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

  const initialValues = (fields: Record<string, SettingConfig>) =>
    Object.keys(fields).reduce(
      (acc, key) => {
        if (
          fields[key]?.type === 'list' ||
          fields[key]?.type === 'nested object'
        ) {
          acc[key] = fields[key]?.value
            ? JSON.stringify(fields[key]?.value, null, 2)
            : null;
        } else {
          acc[key] = fields[key]?.value ?? '';
        }
        return acc;
      },
      {} as Record<string, unknown>
    );
  return (
    <CardBody>
      {Boolean(isLoading) && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
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

export default TroubleshootingEdit;
