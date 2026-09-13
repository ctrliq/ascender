import type { SettingConfig } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { FormRoot } from 'components/Form';
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
import RevertAllAlert from './RevertAllAlert';
import { formatJson } from './settingUtils';
import RevertFormActionGroup from './RevertFormActionGroup';

export type SettingsConfigMap = Record<string, SettingConfig>;

export interface SettingsEditFormProps {
  /** The settings category to read, save and revert, such as `radius`. */
  category: string;
  /** Where to go after a save, a revert or a cancel. */
  detailUrl: string;
  /**
   * The fields for this category, given the configuration just read.
   * Everything around them is the same for every category and lives here.
   */
  children: (config: SettingsConfigMap) => React.ReactNode;
}

/**
 * One settings category's edit form.
 *
 * Every category's edit screen did the same work around its own list of
 * fields: read the category, merge each value with the PUT options that
 * describe it, build initial values, save, revert, cancel, and render the
 * loading, error, form, revert button and confirmation modal scaffolding. The
 * only things that differed were the category name, where to navigate back to,
 * and which fields to show, so those three are what a screen still says.
 */
function SettingsEditForm({
  category,
  detailUrl,
  children,
}: SettingsEditFormProps) {
  const navigate = useNavigate();
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request: fetchSettings,
    result: config,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory(category);
      const merged: SettingsConfigMap = {};
      Object.keys(data).forEach((key) => {
        if (!options[key]) {
          // A value the PUT options do not describe has no label, no help text
          // and no type, so there is no field to render for it. Seventeen of
          // the twenty one screens skipped these already.
          return;
        }
        merged[key] = { ...options[key], value: data[key] };
      });
      return merged;
    }, [category, options]),
    null
  );

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const { error: submitError, request: submitForm } = useRequest(
    useCallback(
      async (values: Record<string, unknown>) => {
        await SettingsAPI.updateAll(values);
        navigate(detailUrl);
      },
      [navigate, detailUrl]
    ),
    null
  );

  const { error: revertError, request: revertAll } = useRequest(
    useCallback(async () => {
      await SettingsAPI.revertCategory(category);
    }, [category]),
    null
  );

  const handleSubmit = async (form: Record<string, unknown>) => {
    // The mirror of initialValues: a list or a nested object went into the
    // editor as JSON text, so it comes back out as the value it was. Screens
    // did this by naming each such field; the configuration already says which
    // they are.
    const values = { ...form };
    Object.keys(config ?? {}).forEach((key) => {
      if (
        config?.[key]?.type === 'list' ||
        config?.[key]?.type === 'nested object'
      ) {
        values[key] = formatJson(form[key]);
      }
    });
    await submitForm(values);
  };

  const handleRevertAll = async () => {
    await revertAll();

    closeModal();

    navigate(detailUrl);
  };

  const handleCancel = () => {
    navigate(detailUrl);
  };

  const initialValues = (fields: SettingsConfigMap) =>
    Object.keys(fields).reduce(
      (acc, key) => {
        if (
          fields[key]?.type === 'list' ||
          fields[key]?.type === 'nested object'
        ) {
          // The editor these render in takes text, so a list or an object has
          // to arrive as JSON rather than as itself.
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
      {!isLoading && config && (
        <FormRoot initialValues={initialValues(config)} onSubmit={handleSubmit}>
          {(formik) => (
            <Form autoComplete="off" onSubmit={formik.handleSubmit}>
              <FormColumnLayout>
                {children(config)}
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
        </FormRoot>
      )}
    </CardBody>
  );
}

export default SettingsEditForm;
