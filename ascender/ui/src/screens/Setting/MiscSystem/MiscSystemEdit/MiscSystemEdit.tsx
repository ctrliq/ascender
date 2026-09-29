import type { SettingConfig, SummaryFieldRef } from 'types/api';
//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React, { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
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
import { SettingsAPI, ExecutionEnvironmentsAPI } from 'api';
import ResourceTabs from 'components/ResourceTabs';
import { groupFromPath, pickGroup } from '../../shared/settingGroups';
import { GROUPS } from '../groups';
import {
  BooleanField,
  // EncryptedField,
  ExecutionEnvField,
  InputField,
  ObjectField,
  RevertAllAlert,
  RevertFormActionGroup,
} from '../../shared';
import { factoryDefaults, pluck, formatJson } from '../../shared/settingUtils';

function MiscSystemEdit() {
  const { pathname } = useLocation();
  const { t, i18n } = useLingui();
  // The tab being edited, which is the only group this form shows and the
  // only one it saves.
  const group = groupFromPath(GROUPS, pathname);
  const is = (id: string) => group.id === id;
  const navigate = useNavigate();
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request: fetchSystem,
    result: system,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('system');
      const systemData = pluck(
        data,
        'ACTIVITY_STREAM_ENABLED',
        'ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC',
        'MANAGE_ORGANIZATION_AUTH',
        'ORG_ADMINS_CAN_SEE_ALL_USERS',
        'ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS',
        'REMOTE_HOST_HEADERS',
        'ASCENDER_URL_BASE',
        'DEFAULT_EXECUTION_ENVIRONMENT',
        'PROXY_IP_ALLOWED_LIST',
        'CSRF_TRUSTED_ORIGINS'
      );

      const mergedData: Record<string, SettingConfig> = {};
      Object.keys(systemData).forEach((key) => {
        if (!options[key]) {
          return;
        }
        mergedData[key] = { ...options[key], value: systemData[key] };
      });
      return mergedData;
    }, [options]),
    null
  );

  useEffect(() => {
    fetchSystem();
  }, [fetchSystem]);

  const { error: submitError, request: submitForm } = useRequest(
    useCallback(
      async (values: Record<string, unknown>) => {
        await SettingsAPI.updateAll(values);
        navigate(`/system/${group.id}`);
      },
      [navigate, group.id]
    ),
    null
  );

  const { error: revertError, request: revertAll } = useRequest(
    useCallback(async () => {
      // The tab's own settings. A DELETE on the category would reset every
      // tab and the settings this screen never shows as well.
      await SettingsAPI.updateAll(factoryDefaults(group.keys, options));
    }, [group, options]),
    null
  );

  /*
   * Only the tab's own settings go back, after the formatting the api needs:
   * a save of the users tab that sent the proxy lists and the execution
   * environment with it rewrote settings nobody touched, and put back a value
   * another admin changed meanwhile.
   */
  const handleSubmit = async (form: Record<string, unknown>) => {
    await submitForm(
      pickGroup(
        {
          ...form,
          PROXY_IP_ALLOWED_LIST: formatJson(form.PROXY_IP_ALLOWED_LIST),
          CSRF_TRUSTED_ORIGINS: formatJson(form.CSRF_TRUSTED_ORIGINS),
          REMOTE_HOST_HEADERS: formatJson(form.REMOTE_HOST_HEADERS),
          DEFAULT_EXECUTION_ENVIRONMENT:
            (form.DEFAULT_EXECUTION_ENVIRONMENT as SummaryFieldRef | null)
              ?.id || null,
        },
        group.keys
      )
    );
  };

  const handleRevertAll = async () => {
    await revertAll();

    closeModal();

    navigate(`/system/${group.id}`);
  };

  const handleCancel = () => {
    navigate(`/system/${group.id}`);
  };

  const initialValues = (fields: Record<string, SettingConfig>) =>
    Object.keys(fields).reduce(
      (acc, key) => {
        if (fields[key]?.type === 'list') {
          acc[key] = JSON.stringify(fields[key]?.value, null, 2);
        } else {
          acc[key] = fields[key]?.value ?? '';
        }
        return acc;
      },
      {} as Record<string, unknown>
    );

  // A setting's value is whatever its own type says; this one is an id, which
  // is what the lookup below is read by.
  const executionEnvironmentId =
    (system?.DEFAULT_EXECUTION_ENVIRONMENT?.value as number | null) || null;

  const {
    isLoading: isLoadingExecutionEnvironment,
    error: errorExecutionEnvironment,
    request: fetchExecutionEnvironment,
    result: executionEnvironment,
  } = useRequest(
    useCallback(async () => {
      if (!executionEnvironmentId) {
        return '';
      }
      const { data } = await ExecutionEnvironmentsAPI.readDetail(
        executionEnvironmentId
      );
      return data;
    }, [executionEnvironmentId])
  );

  useEffect(() => {
    fetchExecutionEnvironment();
  }, [fetchExecutionEnvironment]);

  const isBusy = isLoading || isLoadingExecutionEnvironment;

  return (
    <>
      <ResourceTabs
        aria-label={t`System tabs`}
        ouiaId="system-edit-tabs"
        tabs={GROUPS.map(({ id, label }) => ({
          label: i18n._(label),
          path: `/system/edit/${id}`,
        }))}
      />
      <CardBody>
        {isBusy && <ContentLoading />}
        {!isBusy && Boolean(error || errorExecutionEnvironment) && (
          <ContentError error={error || errorExecutionEnvironment} />
        )}
        {/* Only once the environment the setting names has been read: a form
            opened without it shows the field empty, and a save of it would
            clear the setting. */}
        {!isBusy &&
          !error &&
          !errorExecutionEnvironment &&
          system &&
          executionEnvironment !== undefined && (
            <FormRoot
              initialValues={{
                ...initialValues(system),
                DEFAULT_EXECUTION_ENVIRONMENT: executionEnvironment
                  ? {
                      id: executionEnvironment.id,
                      name: executionEnvironment.name,
                    }
                  : null,
              }}
              onSubmit={handleSubmit}
            >
              {(formik) => (
                <Form autoComplete="off" onSubmit={formik.handleSubmit}>
                  <FormColumnLayout>
                    {/* One tab's fields, which are the only ones this form
                    shows. */}
                    {is('activity_stream') && (
                      <>
                        <BooleanField
                          name="ACTIVITY_STREAM_ENABLED"
                          config={system.ACTIVITY_STREAM_ENABLED}
                        />
                        <BooleanField
                          name="ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC"
                          config={
                            system.ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC
                          }
                        />
                      </>
                    )}
                    {is('execution_environment') && (
                      <ExecutionEnvField
                        name="DEFAULT_EXECUTION_ENVIRONMENT"
                        config={system.DEFAULT_EXECUTION_ENVIRONMENT}
                      />
                    )}
                    {is('misc') && (
                      <InputField
                        name="ASCENDER_URL_BASE"
                        config={system.ASCENDER_URL_BASE}
                        isRequired
                        type="url"
                      />
                    )}
                    {is('security') && (
                      <>
                        <ObjectField
                          name="REMOTE_HOST_HEADERS"
                          config={system.REMOTE_HOST_HEADERS}
                        />
                        <ObjectField
                          name="PROXY_IP_ALLOWED_LIST"
                          config={system.PROXY_IP_ALLOWED_LIST}
                        />
                        <ObjectField
                          name="CSRF_TRUSTED_ORIGINS"
                          config={system.CSRF_TRUSTED_ORIGINS}
                        />
                      </>
                    )}
                    {is('users') && (
                      <>
                        <BooleanField
                          name="ORG_ADMINS_CAN_SEE_ALL_USERS"
                          config={system.ORG_ADMINS_CAN_SEE_ALL_USERS}
                        />
                        <BooleanField
                          name="ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS"
                          config={system.ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS}
                        />
                        <BooleanField
                          name="MANAGE_ORGANIZATION_AUTH"
                          config={system.MANAGE_ORGANIZATION_AUTH}
                        />
                      </>
                    )}
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
    </>
  );
}

export default MiscSystemEdit;
