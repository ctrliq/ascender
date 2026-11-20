import type { SettingConfig } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useLocation, useNavigate } from 'react-router';
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
import {
  BooleanField,
  ChoiceField,
  FileUploadField,
  InputField,
  TextAreaField,
} from '../../shared/SharedFields';
import { RevertAllAlert, RevertFormActionGroup } from '../../shared';
import { factoryDefaults } from '../../shared/settingUtils';
import { groupFromPath, pickGroup } from '../../shared/settingGroups';
import { GROUPS } from '../groups';

/**
 * The field one setting is edited with.
 *
 * The same controls this screen has always used, keyed by setting so a tab can
 * render its own few: the browser title is an input because it ends up inside a
 * <title> and cannot hold newlines, the login text is a block of html, the two
 * logos are uploads, the theme is a stylesheet, the two fallbacks are choices,
 * the two counts are required numbers, and live updates is the one switch with
 * a load cost behind it.
 *
 * Args:
 *     key: The setting to render.
 *     uiData: Every setting this category holds, with its options.
 *
 * Returns:
 *     The field, or null for a setting this screen does not edit.
 */
function renderField(
  key: string,
  uiData: Record<string, SettingConfig>,
  labels: Record<string, string>
): React.ReactNode {
  const base = uiData[key];
  if (!base) {
    return null;
  }
  // The API names a setting after what it holds; where the field takes a file
  // rather than a value, the label says so.
  const config = labels[key] ? { ...base, label: labels[key] } : base;
  switch (key) {
    case 'CUSTOM_TITLE':
      return (
        <FormFullWidthLayout>
          <InputField name={key} config={config} />
        </FormFullWidthLayout>
      );
    case 'CUSTOM_LOGIN_INFO':
      return (
        <FormFullWidthLayout>
          <TextAreaField name={key} config={config} />
        </FormFullWidthLayout>
      );
    case 'CUSTOM_LOGO':
    case 'CUSTOM_HEADER_LOGO':
      return <FileUploadField name={key} config={config} type="dataURL" />;
    case 'CUSTOM_THEME_NAME':
      return (
        <FormFullWidthLayout>
          <InputField name={key} config={config} />
        </FormFullWidthLayout>
      );
    case 'CUSTOM_THEME':
      /*
       * A stylesheet arrives as a file rather than as pasted text: the browser
       * reads it and the contents go in, which is the same thing the two logos
       * do. What it cannot be is a file written next to the themes that ship,
       * because those are bundled at build time and a running install has no
       * such directory: the saved stylesheet is served back as a style element
       * by customTheme.ts instead.
       */
      return (
        <FileUploadField
          name={key}
          config={config}
          type="text"
          hasPreview={false}
        />
      );
    case 'DEFAULT_UI_THEME':
    case 'DEFAULT_UI_LANGUAGE':
      return <ChoiceField name={key} config={config} />;
    case 'MAX_UI_JOB_EVENTS':
    case 'MAX_UI_EDITOR_ROWS':
      return <InputField name={key} config={config} type="number" isRequired />;
    case 'UI_LIVE_UPDATES_ENABLED':
      return <BooleanField name={key} config={config} />;
    default:
      return null;
  }
}

function UIEdit() {
  const { t, i18n } = useLingui();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The tab being edited, which is the only group this form shows and the only
  // one it saves: a page of eleven fields to change one of them is what the
  // tabs on the detail view were there to end.
  const group = groupFromPath(GROUPS, pathname);
  // Back to the tab this form edited rather than the first one, so a save or a
  // cancel lands where the reader left off.
  const detailUrl = `/appearance/${group.id}`;
  const FIELD_LABELS: Record<string, string> = {
    CUSTOM_THEME: t`Custom Theme CSS File`,
  };
  const { isModalOpen, toggleModal, closeModal } = useModal();
  const { PUT: options = {} } = useSettings();

  const {
    isLoading,
    error,
    request: fetchUI,
    result: uiData,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('ui');
      const mergedData: Record<string, SettingConfig> = {};
      Object.keys(data).forEach((key) => {
        if (!options[key]) {
          return;
        }
        // Spread rather than assign: options[key] is the object the Settings
        // context holds and every other screen reads, so writing a value into
        // it put this category's values into shared state.
        mergedData[key] = {
          ...options[key],
          value: data[key] ?? { value: null, label: '' }, // Fallback for undefined values
        };
      });
      return mergedData;
    }, [options]),
    null
  );

  useEffect(() => {
    fetchUI();
  }, [fetchUI]);

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
      // The tab's own settings. A DELETE on the category would reset every
      // tab, so reverting the title would also drop the logos and the theme.
      await SettingsAPI.updateAll(factoryDefaults(group.keys, options));
    }, [group, options]),
    null
  );

  /*
   * Only the tab's own settings go back. The form holds every one of them so
   * that its values are all there to read, but a save of the title tab sending
   * the logos and the theme with it rewrote settings nobody touched, and a
   * value another admin changed meanwhile was put back to the one loaded here.
   */
  const handleSubmit = async (form: Record<string, unknown>) => {
    await submitForm(pickGroup(form, group.keys));
  };

  const handleRevertAll = async () => {
    await revertAll();

    closeModal();

    navigate(detailUrl, {
      state: { hardReload: true },
    });
  };

  const handleCancel = () => {
    navigate(detailUrl);
  };

  return (
    <>
      <ResourceTabs
        aria-label={t`Appearance tabs`}
        ouiaId="appearance-edit-tabs"
        tabs={GROUPS.map(({ id, label }) => ({
          label: i18n._(label),
          path: `/appearance/edit/${id}`,
        }))}
      />
      <CardBody>
        {Boolean(isLoading) && <ContentLoading />}
        {!isLoading && Boolean(error) && <ContentError error={error} />}
        {!isLoading && uiData && (
          <FormRoot
            initialValues={{
              CUSTOM_LOGIN_INFO: uiData?.CUSTOM_LOGIN_INFO?.value ?? '',
              CUSTOM_TITLE: uiData?.CUSTOM_TITLE?.value ?? '',
              CUSTOM_LOGO: uiData?.CUSTOM_LOGO?.value ?? '',
              CUSTOM_HEADER_LOGO: uiData?.CUSTOM_HEADER_LOGO?.value ?? '',
              CUSTOM_THEME: uiData?.CUSTOM_THEME?.value ?? '',
              CUSTOM_THEME_NAME: uiData?.CUSTOM_THEME_NAME?.value ?? '',
              DEFAULT_UI_THEME: uiData?.DEFAULT_UI_THEME?.value ?? '',
              DEFAULT_UI_LANGUAGE: uiData?.DEFAULT_UI_LANGUAGE?.value ?? '',
              MAX_UI_JOB_EVENTS: uiData?.MAX_UI_JOB_EVENTS?.value ?? 4000,
              MAX_UI_EDITOR_ROWS: uiData?.MAX_UI_EDITOR_ROWS?.value ?? 50,
              UI_LIVE_UPDATES_ENABLED:
                uiData?.UI_LIVE_UPDATES_ENABLED?.value ?? true,
            }}
            onSubmit={handleSubmit}
          >
            {(formik) => (
              <Form autoComplete="off" onSubmit={formik.handleSubmit}>
                <FormColumnLayout>
                  {/* Only the group the tab above names, so a save carries what
                    was on screen and nothing else. */}
                  {group.keys.map((key) => (
                    <React.Fragment key={key}>
                      {renderField(key, uiData, FIELD_LABELS)}
                    </React.Fragment>
                  ))}
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

export default UIEdit;
