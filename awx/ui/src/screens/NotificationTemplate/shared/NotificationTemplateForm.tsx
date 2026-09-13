import type { NotificationTemplate, SummaryFieldRef } from 'types/api';
import React, { useCallback } from 'react';
import { Formik, useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';

import AnsibleSelect from 'components/AnsibleSelect';
import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import { OrganizationLookup } from 'components/Lookup';
import { required } from 'util/validators';
import { FormColumnLayout } from 'components/FormLayout';
import TypeInputsSubForm from './TypeInputsSubForm';
import CustomMessagesSubForm from './CustomMessagesSubForm';
import hasCustomMessages from './hasCustomMessages';
import typeFieldNames, { initialConfigValues } from './typeFieldNames';

/** The text one notification carries: a one line message and a longer body. */
export interface NotificationText {
  message?: string | null;
  body?: string | null;
}

/**
 * The text a template sends for each thing that can happen to a job, and for
 * each outcome of an approval node.
 */
export interface NotificationMessages {
  started?: NotificationText;
  success?: NotificationText;
  error?: NotificationText;
  changed?: NotificationText;
  workflow_approval?: {
    approved?: NotificationText;
    denied?: NotificationText;
    running?: NotificationText;
    timed_out?: NotificationText;
  };
}

/** The messages a notification of each type sends unless it is overridden. */
export type DefaultMessages = Record<string, NotificationMessages>;

/**
 * What the notification template form holds. The type details are keyed by
 * what the chosen notification type asks for, so they are left open.
 */
export interface NotificationTemplateFormValues {
  name?: string | null;
  description?: string | null;
  notification_type?: string | null;
  organization?: SummaryFieldRef | null;
  notification_configuration?: Record<string, unknown>;
  messages?: NotificationMessages | null;
  useCustomMessages?: boolean;
  emailOptions?: string;
  [key: string]: unknown;
}

export interface NotificationTemplateFormProps {
  template?: Partial<NotificationTemplate>;
  defaultMessages: DefaultMessages;
  onSubmit: (values: NotificationTemplateFormValues) => void;
  onCancel: () => void;
  submitError?: unknown;
  [key: string]: unknown;
}

export interface NotificationTemplateFormFieldsProps {
  defaultMessages: DefaultMessages;
  template: Partial<NotificationTemplate>;
  [key: string]: unknown;
}

function NotificationTemplateFormFields({
  defaultMessages,
  template,
}: NotificationTemplateFormFieldsProps) {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } =
    useFormikContext<NotificationTemplateFormValues>();
  const [orgField, orgMeta, orgHelpers] = useField('organization');
  const [typeField, typeMeta] = useField({
    name: 'notification_type',
    validate: required(t`Select a value for this field`),
  });

  const handleOrganizationUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormField
        id="notification-name"
        name="name"
        type="text"
        label={t`Name`}
        validate={required(null)}
        isRequired
      />
      <FormField
        id="notification-description"
        name="description"
        type="text"
        label={t`Description`}
      />
      <OrganizationLookup
        helperTextInvalid={orgMeta.error}
        isValid={!orgMeta.touched || !orgMeta.error}
        onBlur={() => orgHelpers.setTouched(true)}
        onChange={handleOrganizationUpdate}
        value={orgField.value}
        touched={orgMeta.touched}
        error={orgMeta.error}
        required
        autoPopulate={!template?.id}
        validate={required(t`Select a value for this field`)}
      />
      <FormGroup fieldId="notification-type" isRequired label={t`Type`}>
        <AnsibleSelect
          {...typeField}
          id="notification-type"
          isValid={!typeMeta.touched || !typeMeta.error}
          data={[
            {
              value: '',
              key: 'none',
              label: t`Choose a Notification Type`,
              isDisabled: true,
            },
            { value: 'email', key: 'email', label: t`E-mail` },
            { value: 'grafana', key: 'grafana', label: 'Grafana' },
            { value: 'irc', key: 'irc', label: 'IRC' },
            { value: 'mattermost', key: 'mattermost', label: 'Mattermost' },
            { value: 'pagerduty', key: 'pagerduty', label: 'Pagerduty' },
            { value: 'rocketchat', key: 'rocketchat', label: 'Rocket.Chat' },
            { value: 'slack', key: 'slack', label: 'Slack' },
            { value: 'twilio', key: 'twilio', label: 'Twilio' },
            { value: 'webhook', key: 'webhook', label: 'Webhook' },
          ]}
        />
        {typeMeta.touched && typeMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">{typeMeta.error}</HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      {typeField.value && (
        <TypeInputsSubForm
          type={typeField.value}
          isEdit={Boolean(template?.id)}
        />
      )}
      <CustomMessagesSubForm
        defaultMessages={defaultMessages}
        type={typeField.value}
      />
    </>
  );
}

function NotificationTemplateForm({
  template = { name: '', description: '' },
  defaultMessages,
  onSubmit,
  onCancel,
  submitError = null,
}: NotificationTemplateFormProps) {
  const handleSubmit = (values: NotificationTemplateFormValues) => {
    onSubmit(
      normalizeFields(
        {
          ...values,
          organization: values.organization?.id as unknown as SummaryFieldRef,
        },
        defaultMessages
      )
    );
  };

  const messages: NotificationMessages = (template.messages ?? {
    workflow_approval: {},
  }) as NotificationMessages;
  const defs = defaultMessages[template.notification_type || 'email'] ?? {};
  const approvalDefaults = defs.workflow_approval ?? {};
  const mergeDefaultMessages = (
    def: NotificationText = {},
    templ: NotificationText = {}
  ) => ({
    message: templ?.message || def.message || '',
    body: templ?.body || def.body || '',
  });

  const { headers } = (template?.notification_configuration ?? {}) as Record<
    string,
    unknown
  >;

  return (
    <Formik
      initialValues={{
        name: template.name,
        description: template.description,
        notification_type: template.notification_type,
        notification_configuration: {
          ...initialConfigValues,
          ...template.notification_configuration,
          headers: headers ? JSON.stringify(headers, null, 2) : null,
        },
        organization: template.summary_fields?.organization,
        messages: {
          started: { ...mergeDefaultMessages(defs.started, messages.started) },
          success: { ...mergeDefaultMessages(defs.success, messages.success) },
          error: { ...mergeDefaultMessages(defs.error, messages.error) },
          changed: { ...mergeDefaultMessages(defs.changed, messages.changed) },
          workflow_approval: {
            approved: {
              ...mergeDefaultMessages(
                approvalDefaults.approved,
                messages.workflow_approval?.approved
              ),
            },
            denied: {
              ...mergeDefaultMessages(
                approvalDefaults.denied,
                messages.workflow_approval?.denied
              ),
            },
            running: {
              ...mergeDefaultMessages(
                approvalDefaults.running,
                messages.workflow_approval?.running
              ),
            },
            timed_out: {
              ...mergeDefaultMessages(
                approvalDefaults.timed_out,
                messages.workflow_approval?.timed_out
              ),
            },
          },
        },
        useCustomMessages: hasCustomMessages(messages, defs),
      }}
      onSubmit={handleSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <NotificationTemplateFormFields
              defaultMessages={defaultMessages}
              template={template}
            />
            <FormSubmitError error={submitError} />
            <FormActionGroup
              onCancel={onCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </Formik>
  );
}

export default NotificationTemplateForm;

function normalizeFields(
  values: NotificationTemplateFormValues,
  defaultMessages: DefaultMessages
) {
  return normalizeTypeFields(normalizeMessageFields(values, defaultMessages));
}

/* If the user filled in some of the Type Details fields, then switched
 * to a different notification type, unecessary fields may be set in the
 * notification_configuration — this function strips them off */
function normalizeTypeFields(values: NotificationTemplateFormValues) {
  const stripped: Record<string, unknown> = {};
  const fields =
    typeFieldNames[values.notification_type as keyof typeof typeFieldNames];

  const configuration = values.notification_configuration ?? {};
  fields.forEach((fieldName) => {
    if (typeof configuration[fieldName] !== 'undefined') {
      stripped[fieldName] = configuration[fieldName];
    }
  });
  if (values.notification_type === 'webhook') {
    stripped.headers = stripped.headers
      ? JSON.parse(stripped.headers as string)
      : {};
  }
  const { emailOptions, ...rest } = values;

  return {
    ...rest,
    notification_configuration: stripped,
  };
}

function normalizeMessageFields(
  values: NotificationTemplateFormValues,
  defaults: DefaultMessages
) {
  const { useCustomMessages, ...rest } = values;
  if (!useCustomMessages) {
    return {
      ...rest,
      messages: null,
    };
  }
  const messages: NotificationMessages = values.messages ?? {};
  const defs = defaults[values.notification_type ?? 'email'] ?? {};
  const approvals = messages.workflow_approval ?? {};
  const defaultApprovals = defs.workflow_approval ?? {};

  const nullIfDefault = (
    m: NotificationText = {},
    d: NotificationText = {}
  ) => ({
    message: m.message === d.message ? null : m.message,
    body: m.body === d.body ? null : m.body,
  });

  const nonDefaultMessages = {
    started: nullIfDefault(messages.started, defs.started),
    success: nullIfDefault(messages.success, defs.success),
    error: nullIfDefault(messages.error, defs.error),
    changed: nullIfDefault(messages.changed, defs.changed),
    workflow_approval: {
      approved: nullIfDefault(approvals.approved, defaultApprovals.approved),
      denied: nullIfDefault(approvals.denied, defaultApprovals.denied),
      running: nullIfDefault(approvals.running, defaultApprovals.running),
      timed_out: nullIfDefault(approvals.timed_out, defaultApprovals.timed_out),
    },
  };

  return {
    ...rest,
    messages: nonDefaultMessages,
  };
}
