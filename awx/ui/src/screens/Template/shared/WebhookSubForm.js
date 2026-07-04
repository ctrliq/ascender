import React, { useEffect, useCallback } from 'react';
import { SyncAltIcon } from '@patternfly/react-icons';
import { useParams, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import {
  Alert,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
  InputGroup,
  Button, InputGroupItem,
} from '@patternfly/react-core';
import { useField, useFormikContext } from 'formik';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useRequest from 'hooks/useRequest';
import FormField from 'components/FormField';
import { FormColumnLayout } from 'components/FormLayout';
import { CredentialLookup } from 'components/Lookup';
import AnsibleSelect from 'components/AnsibleSelect';
import Popover from 'components/Popover';
import {
  JobTemplatesAPI,
  ProjectsAPI,
  WorkflowJobTemplatesAPI,
  CredentialTypesAPI,
} from 'api';
import getProjectHelpText from '../../Project/shared/Project.helptext';
import getHelpText from './WorkflowJobTemplate.helptext';

function WebhookSubForm({ templateType }) {
  const { t } = useLingui();
  const { setFieldValue } = useFormikContext();
  const { id } = useParams();
  const { pathname } = useLocation();
  const { origin } = document.location;
  // Projects use the webhook to trigger an SCM update, so there is no
  // credential to post job statuses back with and no payload variables.
  const isProject = templateType === 'project';
  const helpText = isProject ? getProjectHelpText(t) : getHelpText(t);

  const [webhookServiceField, webhookServiceMeta, webhookServiceHelpers] =
    useField('webhook_service');
  const [webhookUrlField, , webhookUrlHelpers] = useField('webhook_url');
  const [webhookKeyField, webhookKeyMeta, webhookKeyHelpers] =
    useField('webhook_key');
  const [
    webhookCredentialField,
    webhookCredentialMeta,
    webhookCredentialHelpers,
  ] = useField('webhook_credential');

  const {
    request: loadCredentialType,
    error,
    isLoading,
    result: credTypeId,
  } = useRequest(
    useCallback(async () => {
      let results;
      if (webhookServiceField.value && !isProject) {
        results = await CredentialTypesAPI.read({
          namespace: `${webhookServiceField.value}_token`,
        });
      }
      return results?.data?.results[0]?.id;
    }, [webhookServiceField.value, isProject])
  );

  useEffect(() => {
    loadCredentialType();
  }, [loadCredentialType]);

  const { request: fetchWebhookKey, error: webhookKeyError } = useRequest(
    useCallback(async () => {
      const webhookKeyAPIs = {
        job_template: JobTemplatesAPI,
        project: ProjectsAPI,
      };
      const webhookKeyAPI =
        webhookKeyAPIs[templateType] || WorkflowJobTemplatesAPI;
      const {
        data: { webhook_key: key },
      } = await webhookKeyAPI.updateWebhookKey(id);
      webhookKeyHelpers.setValue(key);
    }, [webhookKeyHelpers, id, templateType])
  );

  const changeWebhookKey = async () => {
    await fetchWebhookKey();
  };

  const onCredentialChange = useCallback(
    (value) => {
      setFieldValue('webhook_credential', value || null);
    },
    [setFieldValue]
  );

  const isUpdateKeyDisabled =
    pathname.endsWith('/add') || !webhookKeyMeta.initialValue;
  const webhookServiceOptions = [
    {
      value: '',
      key: '',
      label: t`Choose a Webhook Service`,
      isDisabled: true,
    },
    {
      value: 'github',
      key: 'github',
      label: t`GitHub`,
      isDisabled: false,
    },
    {
      value: 'gitlab',
      key: 'gitlab',
      label: t`GitLab`,
      isDisabled: false,
    },
    {
      value: 'bitbucket_dc',
      key: 'bitbucket_dc',
      label: t`Bitbucket Data Center`,
      isDisabled: false,
    },
  ];

  if (error || webhookKeyError) {
    return <ContentError error={error || webhookKeyError} />;
  }
  if (isLoading) {
    return <ContentLoading />;
  }
  return (
    <FormColumnLayout>
      <FormGroup
        name="webhook_service"
        fieldId="webhook_service"
        label={t`Webhook Service`}
        labelHelp={<Popover content={helpText.webhookService} />}
      >
        <AnsibleSelect
          {...webhookServiceField}
          id="webhook_service"
          data={webhookServiceOptions}
          onChange={(event, val) => {
            webhookServiceHelpers.setValue(val);
            webhookUrlHelpers.setValue(
              pathname.endsWith('/add')
                ? (t`a new webhook url will be generated on save.`).toUpperCase()
                : `${origin}/api/v2/${templateType}s/${id}/${val}/`
            );
            if (val === webhookServiceMeta.initialValue || val === '') {
              webhookKeyHelpers.setValue(webhookKeyMeta.initialValue);
              webhookCredentialHelpers.setValue(
                webhookCredentialMeta.initialValue
              );
            } else {
              webhookKeyHelpers.setValue('');
              webhookCredentialHelpers.setValue(null);
            }
          }}
        />
        {webhookServiceMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {webhookServiceMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <>
        <FormGroup
          type="text"
          fieldId="jt-webhookURL"
          label={t`Webhook URL`}
          labelHelp={<Popover content={helpText.webhookURL} />}
          name="webhook_url"
        >
          <TextInput
            id="t-webhookURL"
            aria-label={t`Webhook URL`}
            value={webhookUrlField.value}
            readOnlyVariant="default"
          />
        </FormGroup>
        <FormGroup
          label={t`Webhook Key`}
          labelHelp={<Popover content={helpText.webhookKey} />}
          fieldId="template-webhook_key"
        >
          <InputGroup>
            <InputGroupItem isFill>
              <TextInput
                id="template-webhook_key"
                aria-label={t`workflow job template webhook key`}
                value={webhookKeyField.value}
                placeholder={t`Leave blank to generate a new webhook key on save`}
                onChange={(_event, val) => webhookKeyHelpers.setValue(val)}
              />
            </InputGroupItem>
            <InputGroupItem><Button icon={<SyncAltIcon />}
              ouiaId="update-webhook-key-button"
              isDisabled={isUpdateKeyDisabled}
              variant="tertiary"
              aria-label={t`Update webhook key`}
              onClick={changeWebhookKey}
             /></InputGroupItem>
          </InputGroup>
        </FormGroup>
      </>

      {isProject && (
        <FormField
          id="project-webhook-ref-filter"
          name="webhook_ref_filter"
          type="text"
          label={t`Webhook Ref Filter`}
          tooltip={t`Only sync the project when the pushed ref matches this pattern, for example refs/heads/main or refs/heads/release-*. Leave blank to sync on any push or tag event.`}
        />
      )}

      {!isProject && credTypeId && (
        <CredentialLookup
          label={t`Webhook Credential`}
          tooltip={helpText.webhookCredential}
          credentialTypeId={credTypeId}
          onChange={onCredentialChange}
          isValid={!webhookCredentialMeta.error}
          helperTextInvalid={webhookCredentialMeta.error}
          value={webhookCredentialField.value}
          fieldName="webhook_credential"
        />
      )}
      {!isProject && !credTypeId && !isLoading && webhookServiceField.value && (
        <Alert
          variant="warning"
          isInline
          ouiaId="webhook-credential-type-missing"
          title={t`Unable to look up the credential type for this webhook service, so the webhook credential field is unavailable.`}
        />
      )}
    </FormColumnLayout>
  );
}
export default WebhookSubForm;
