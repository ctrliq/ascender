import type { SettingConfig } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { FormRoot } from 'components/Form';
import { Form } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { FormSubmitError } from 'components/FormField';
import { FormColumnLayout, FormFullWidthLayout } from 'components/FormLayout';
import { useSettings } from 'contexts/Settings';
import useModal from 'hooks/useModal';
import useRequest from 'hooks/useRequest';
import { SettingsAPI } from 'api';
import ResourceTabs from 'components/ResourceTabs';
import { factoryDefaults, formatJson } from '../../shared/settingUtils';
import { groupFromPath, pickGroup } from '../../shared/settingGroups';
import { GROUPS } from '../groups';
import {
  BooleanField,
  ChoiceField,
  EncryptedField,
  InputField,
  ObjectField,
  RevertAllAlert,
  RevertFormActionGroup,
} from '../../shared';

function LoggingEdit() {
  const { pathname } = useLocation();
  // The tab being edited, which is the only group this form shows and the
  // only one it saves: a page of thirteen settings to change one of them is
  // what the tabs on the reading view were there to end.
  const group = groupFromPath(GROUPS, pathname);
  const is = (id: string) => group.id === id;
  // Back to the tab this form edited rather than the first one, so a save or a
  // cancel lands where the reader left off.
  const detailUrl = `/logging/${group.id}`;
  const navigate = useNavigate();
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options = {} } = useSettings();
  const { t, i18n } = useLingui();

  const {
    isLoading,
    error,
    request: fetchLogging,
    result: logging,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('logging');
      const mergedData: Record<string, SettingConfig> = {};
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
    fetchLogging();
  }, [fetchLogging]);

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

  /*
   * Only the tab's own settings go back, after the formatting the api needs.
   * The form holds the whole category so a field can read another tab's value,
   * as the timeout does the protocol, but a save of the general tab sending the
   * rest rewrote settings nobody touched and carried the aggregator password
   * along with it.
   */
  const handleSubmit = async (form: Record<string, unknown>) => {
    await submitForm(
      pickGroup(
        {
          ...form,
          LOG_AGGREGATOR_LOGGERS: formatJson(form.LOG_AGGREGATOR_LOGGERS),
          LOG_AGGREGATOR_HOST: form.LOG_AGGREGATOR_HOST || null,
          LOG_AGGREGATOR_TYPE: form.LOG_AGGREGATOR_TYPE || null,
          API_400_ERROR_LOG_FORMAT: form.API_400_ERROR_LOG_FORMAT || null,
        },
        group.keys
      )
    );
  };

  const { error: revertError, request: revertAll } = useRequest(
    useCallback(async () => {
      // The tab's own settings. A DELETE on the category would reset every
      // tab, and the aggregator settings this screen never shows as well.
      await SettingsAPI.updateAll(factoryDefaults(group.keys, options));
    }, [group, options]),
    null
  );

  const handleRevertAll = async () => {
    await revertAll();

    closeModal();

    navigate(detailUrl);
  };

  const handleCancel = () => {
    navigate(detailUrl);
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

  return (
    <>
      <ResourceTabs
        aria-label={t`Logging tabs`}
        ouiaId="logging-edit-tabs"
        tabs={GROUPS.map(({ id, label }) => ({
          label: i18n._(label),
          path: `/logging/edit/${id}`,
        }))}
      />
      <CardBody>
        {Boolean(isLoading) && <ContentLoading />}
        {!isLoading && Boolean(error) && <ContentError error={error} />}
        {!isLoading && logging && (
          <FormRoot
            initialValues={initialValues(logging)}
            onSubmit={handleSubmit}
          >
            {(formik) => (
              <Form autoComplete="off" onSubmit={formik.handleSubmit}>
                <FormColumnLayout>
                  {/* One tab's fields, which are the only ones this form
                      shows and the only ones it saves. */}
                  {is('general') && (
                    <>
                      <BooleanField
                        name="LOG_AGGREGATOR_ENABLED"
                        config={{
                          ...logging.LOG_AGGREGATOR_ENABLED,
                          help_text: (
                            <>
                              {logging.LOG_AGGREGATOR_ENABLED?.help_text}
                              {!formik.values.LOG_AGGREGATOR_ENABLED &&
                                (!formik.values.LOG_AGGREGATOR_HOST ||
                                  !formik.values.LOG_AGGREGATOR_TYPE) && (
                                  <>
                                    <br />
                                    <br />
                                    {t`Cannot enable log aggregator without providing logging aggregator host and logging aggregator type.`}
                                  </>
                                )}
                            </>
                          ),
                        }}
                        disabled={
                          !formik.values.LOG_AGGREGATOR_ENABLED &&
                          (!formik.values.LOG_AGGREGATOR_HOST ||
                            !formik.values.LOG_AGGREGATOR_TYPE)
                        }
                      />
                      <InputField
                        name="LOG_AGGREGATOR_HOST"
                        config={logging.LOG_AGGREGATOR_HOST}
                        isRequired={Boolean(
                          formik.values.LOG_AGGREGATOR_ENABLED
                        )}
                      />
                      <ChoiceField
                        name="LOG_AGGREGATOR_TYPE"
                        config={logging.LOG_AGGREGATOR_TYPE}
                        isRequired={Boolean(
                          formik.values.LOG_AGGREGATOR_ENABLED
                        )}
                      />
                    </>
                  )}
                  {is('credentials') && (
                    <>
                      <InputField
                        name="LOG_AGGREGATOR_USERNAME"
                        config={logging.LOG_AGGREGATOR_USERNAME}
                      />
                      <EncryptedField
                        name="LOG_AGGREGATOR_PASSWORD"
                        config={logging.LOG_AGGREGATOR_PASSWORD}
                      />
                    </>
                  )}
                  {is('protocol') && (
                    <>
                      <ChoiceField
                        name="LOG_AGGREGATOR_PROTOCOL"
                        config={logging.LOG_AGGREGATOR_PROTOCOL}
                      />
                      <InputField
                        name="LOG_AGGREGATOR_PORT"
                        config={logging.LOG_AGGREGATOR_PORT}
                        type="number"
                      />
                      {/* Both only mean anything once the logs are carried
                          over a protocol that has a connection to time out
                          and a certificate to check. */}
                      {formik.values.LOG_AGGREGATOR_PROTOCOL === 'https' && (
                        <BooleanField
                          name="LOG_AGGREGATOR_VERIFY_CERT"
                          config={logging.LOG_AGGREGATOR_VERIFY_CERT}
                        />
                      )}
                    </>
                  )}
                  {is('misc') && (
                    <>
                      {['tcp', 'https'].includes(
                        String(formik.values.LOG_AGGREGATOR_PROTOCOL)
                      ) && (
                        <InputField
                          name="LOG_AGGREGATOR_TCP_TIMEOUT"
                          config={logging.LOG_AGGREGATOR_TCP_TIMEOUT}
                          type="number"
                          isRequired
                        />
                      )}
                      <ChoiceField
                        name="LOG_AGGREGATOR_LEVEL"
                        config={logging.LOG_AGGREGATOR_LEVEL}
                      />
                      <BooleanField
                        name="LOG_AGGREGATOR_INDIVIDUAL_FACTS"
                        config={logging.LOG_AGGREGATOR_INDIVIDUAL_FACTS}
                      />
                      <ObjectField
                        name="LOG_AGGREGATOR_LOGGERS"
                        config={logging.LOG_AGGREGATOR_LOGGERS}
                      />
                      <FormFullWidthLayout>
                        <InputField
                          name="API_400_ERROR_LOG_FORMAT"
                          config={logging.API_400_ERROR_LOG_FORMAT}
                        />
                      </FormFullWidthLayout>
                    </>
                  )}
                  {Boolean(submitError) && (
                    <FormSubmitError error={submitError} />
                  )}
                  {Boolean(revertError) && (
                    <FormSubmitError error={revertError} />
                  )}
                  <RevertFormActionGroup
                    onCancel={handleCancel}
                    onSubmit={formik.handleSubmit}
                    onRevert={toggleModal}
                  />
                </FormColumnLayout>
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

export default LoggingEdit;
