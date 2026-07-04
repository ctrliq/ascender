import React, { useCallback, useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField, useFormikContext } from 'formik';
import { Checkbox, FormGroup, Title } from '@patternfly/react-core';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import FormField, { CheckboxField } from 'components/FormField';
import Popover from 'components/Popover';
import { required } from 'util/validators';
import {
  FormCheckboxLayout,
  FormColumnLayout,
  FormFullWidthLayout,
} from 'components/FormLayout';
import WebhookSubForm from '../../../Template/shared/WebhookSubForm';
import getProjectHelpStrings from '../Project.helptext';

export const UrlFormField = ({ tooltip }) => {
  const { t } = useLingui();
  return (
    <FormField
      id="project-scm-url"
      isRequired
      label={t`Source Control URL`}
      name="scm_url"
      tooltip={tooltip}
      tooltipMaxWidth="350px"
      type="text"
      validate={required(null)}
    />
  );
};

export const BranchFormField = ({ label }) => {
  const { t } = useLingui();
  const projectHelpStrings = getProjectHelpStrings(t);
  return (
    <FormField
      id="project-scm-branch"
      name="scm_branch"
      type="text"
      label={label}
      tooltip={projectHelpStrings.branchFormField}
    />
  );
};

export const ScmCredentialFormField = ({
  credential,
  onCredentialSelection,
}) => {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } = useFormikContext();

  const onCredentialChange = useCallback(
    (value) => {
      onCredentialSelection('scm', value);
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [onCredentialSelection, setFieldValue, setFieldTouched]
  );

  return (
    <CredentialLookup
      credentialTypeId={credential.typeId}
      label={t`Source Control Credential`}
      value={credential.value}
      onChange={onCredentialChange}
    />
  );
};

export const ScmTypeOptions = ({ scmUpdateOnLaunch, hideAllowOverride }) => {
  const { t } = useLingui();
  const { values } = useFormikContext();
  const projectHelpStrings = getProjectHelpStrings(t);

  const [enableWebhooks, setEnableWebhooks] = useState(
    Boolean(values.webhook_service)
  );
  const [, webhookServiceMeta, webhookServiceHelpers] =
    useField('webhook_service');
  const [, webhookUrlMeta, webhookUrlHelpers] = useField('webhook_url');
  const [, webhookKeyMeta, webhookKeyHelpers] = useField('webhook_key');
  const [, webhookRefFilterMeta, webhookRefFilterHelpers] =
    useField('webhook_ref_filter');

  useEffect(() => {
    if (enableWebhooks) {
      webhookServiceHelpers.setValue(webhookServiceMeta.initialValue);
      webhookUrlHelpers.setValue(webhookUrlMeta.initialValue);
      webhookKeyHelpers.setValue(webhookKeyMeta.initialValue);
      webhookRefFilterHelpers.setValue(webhookRefFilterMeta.initialValue);
    } else {
      webhookServiceHelpers.setValue('');
      webhookUrlHelpers.setValue('');
      webhookKeyHelpers.setValue('');
      webhookRefFilterHelpers.setValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableWebhooks]);

  return (
    <FormFullWidthLayout>
      <FormGroup
        fieldId="project-option-checkboxes"
        label={t`Options`}
      >
        <FormCheckboxLayout>
          <CheckboxField
            id="option-scm-clean"
            name="scm_clean"
            label={t`Clean`}
            tooltip={projectHelpStrings.options.clean}
          />
          <CheckboxField
            id="option-scm-delete-on-update"
            name="scm_delete_on_update"
            label={t`Delete`}
            tooltip={projectHelpStrings.options.delete}
          />
          {values.scm_type === 'git' ? (
            <CheckboxField
              id="option-scm-track-submodules"
              name="scm_track_submodules"
              label={t`Track submodules`}
              tooltip={projectHelpStrings.options.trackSubModules}
            />
          ) : null}
          <CheckboxField
            id="option-scm-update-on-launch"
            name="scm_update_on_launch"
            label={t`Update Revision on Launch`}
            tooltip={projectHelpStrings.options.updateOnLaunch}
          />
          {!hideAllowOverride && (
            <CheckboxField
              id="option-allow-override"
              name="allow_override"
              label={t`Allow Branch Override`}
              tooltip={projectHelpStrings.options.allowBranchOverride}
            />
          )}
          <Checkbox
            aria-label={t`Enable Webhook`}
            label={
              <span>
                {t`Enable Webhook`}
                &nbsp;
                <Popover content={projectHelpStrings.options.enableWebhook} />
              </span>
            }
            id="option-enable-webhook"
            ouiaId="option-enable-webhook"
            isChecked={enableWebhooks}
            onChange={(_event, checked) => {
              setEnableWebhooks(checked);
            }}
          />
        </FormCheckboxLayout>
      </FormGroup>

      {scmUpdateOnLaunch && (
        <>
          <Title size="md" headingLevel="h4">
            {t`Option Details`}
          </Title>
          <FormField
            id="project-cache-timeout"
            name="scm_update_cache_timeout"
            type="number"
            min="0"
            label={t`Cache Timeout`}
            tooltip={projectHelpStrings.options.cacheTimeout}
          />
        </>
      )}

      {enableWebhooks && (
        <>
          <Title size="md" headingLevel="h4">
            {t`Webhook details`}
          </Title>
          <FormColumnLayout>
            <WebhookSubForm templateType="project" />
          </FormColumnLayout>
        </>
      )}
    </FormFullWidthLayout>
  );
};
