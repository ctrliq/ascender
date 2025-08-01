import React, { useEffect, useCallback } from 'react';
import { SyncAltIcon } from '@patternfly/react-icons';
import { useParams, useLocation } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import {
  FormGroup,
  TextInput,
  InputGroup,
  Button,
} from '@patternfly/react-core';
import { useField, useFormikContext } from 'formik';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useRequest from 'hooks/useRequest';
import { FormColumnLayout } from 'components/FormLayout';
import { CredentialLookup } from 'components/Lookup';
import AnsibleSelect from 'components/AnsibleSelect';
import Popover from 'components/Popover';
import {
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
  CredentialTypesAPI,
} from 'api';
import getHelpText from './WorkflowJobTemplate.helptext';

function WebhookSubForm({ templateType }) {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const { setFieldValue } = useFormikContext();
  const { id } = useParams();
  const { pathname } = useLocation();
  const { origin } = document.location;

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
      if (webhookServiceField.value) {
        results = await CredentialTypesAPI.read({
          namespace: `${webhookServiceField.value}_token`,
        });
        // TODO: Consider how to handle the situation where the results returns
        // and empty array, or any of the other values is undefined or null (data, results, id)
      }
      return results?.data?.results[0]?.id;
    }, [webhookServiceField.value])
  );

  useEffect(() => {
    loadCredentialType();
  }, [loadCredentialType]);

  const { request: fetchWebhookKey, error: webhookKeyError } = useRequest(
    useCallback(async () => {
      const updateWebhookKey =
        templateType === 'job_template'
          ? JobTemplatesAPI.updateWebhookKey(id)
          : WorkflowJobTemplatesAPI.updateWebhookKey(id);
      const {
        data: { webhook_key: key },
      } = await updateWebhookKey;
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
    pathname.endsWith('/add') ||
    webhookKeyMeta.initialValue ===
      'A NEW WEBHOOK KEY WILL BE GENERATED ON SAVE.';
  const webhookServiceOptions = [
    {
      value: '',
      key: '',
      label: i18n._(msg`Choose a Webhook Service`),
      isDisabled: true,
    },
    {
      value: 'github',
      key: 'github',
      label: i18n._(msg`GitHub`),
      isDisabled: false,
    },
    {
      value: 'gitlab',
      key: 'gitlab',
      label: i18n._(msg`GitLab`),
      isDisabled: false,
    },
    {
      value: 'bitbucket_dc',
      key: 'bitbucket_dc',
      label: i18n._(msg`Bitbucket Data Center`),
      isDisabled: false,
    },
  ];

  if (error || webhookKeyError) {
    return <ContentError error={error} />;
  }
  if (isLoading) {
    return <ContentLoading />;
  }
  return (
    <FormColumnLayout>
      <FormGroup
        name="webhook_service"
        fieldId="webhook_service"
        helperTextInvalid={webhookServiceMeta.error}
        label={i18n._(msg`Webhook Service`)}
        labelIcon={<Popover content={helpText.webhookService} />}
      >
        <AnsibleSelect
          {...webhookServiceField}
          id="webhook_service"
          data={webhookServiceOptions}
          onChange={(event, val) => {
            webhookServiceHelpers.setValue(val);
            webhookUrlHelpers.setValue(
              pathname.endsWith('/add')
                ? i18n
                    ._(msg`a new webhook url will be generated on save.`)
                    .toUpperCase()
                : `${origin}/api/v2/${templateType}s/${id}/${val}/`
            );
            if (val === webhookServiceMeta.initialValue || val === '') {
              webhookKeyHelpers.setValue(webhookKeyMeta.initialValue);
              webhookCredentialHelpers.setValue(
                webhookCredentialMeta.initialValue
              );
            } else {
              webhookKeyHelpers.setValue(
                i18n
                  ._(msg`a new webhook key will be generated on save.`)
                  .toUpperCase()
              );
              webhookCredentialHelpers.setValue(null);
            }
          }}
        />
      </FormGroup>
      <>
        <FormGroup
          type="text"
          fieldId="jt-webhookURL"
          label={i18n._(msg`Webhook URL`)}
          labelIcon={<Popover content={helpText.webhookURL} />}
          name="webhook_url"
        >
          <TextInput
            id="t-webhookURL"
            aria-label={i18n._(msg`Webhook URL`)}
            value={webhookUrlField.value}
            isReadOnly
          />
        </FormGroup>
        <FormGroup
          label={i18n._(msg`Webhook Key`)}
          labelIcon={<Popover content={helpText.webhookKey} />}
          fieldId="template-webhook_key"
        >
          <InputGroup>
            <TextInput
              id="template-webhook_key"
              isReadOnly
              aria-label={i18n._(msg`workflow job template webhook key`)}
              value={webhookKeyField.value}
            />
            <Button
              ouiaId="update-webhook-key-button"
              isDisabled={isUpdateKeyDisabled}
              variant="tertiary"
              aria-label={i18n._(msg`Update webhook key`)}
              onClick={changeWebhookKey}
            >
              <SyncAltIcon />
            </Button>
          </InputGroup>
        </FormGroup>
      </>

      {credTypeId && (
        <CredentialLookup
          label={i18n._(msg`Webhook Credential`)}
          tooltip={helpText.webhookCredential}
          credentialTypeId={credTypeId}
          onChange={onCredentialChange}
          isValid={!webhookCredentialMeta.error}
          helperTextInvalid={webhookCredentialMeta.error}
          value={webhookCredentialField.value}
          fieldName="webhook_credential"
        />
      )}
    </FormColumnLayout>
  );
}
export default WebhookSubForm;
