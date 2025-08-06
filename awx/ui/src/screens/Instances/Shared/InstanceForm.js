import React from 'react';
import { t } from '@lingui/react/macro';
import { i18n } from '@lingui/core';
import { Formik, useField } from 'formik';
import { Form, FormGroup, CardBody } from '@patternfly/react-core';
import { FormColumnLayout } from 'components/FormLayout';
import FormField, {
  FormSubmitError,
  CheckboxField,
} from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup';
import AnsibleSelect from 'components/AnsibleSelect';
import { required } from 'util/validators';

function InstanceFormFields({ isEdit }) {
  const INSTANCE_TYPES = [
    { id: 'execution', name: i18n._(t`Execution`) },
    { id: 'hop', name: i18n._(t`Hop`) },
  ];

  const [instanceTypeField, instanceTypeMeta, instanceTypeHelpers] = useField({
    name: 'node_type',
    validate: required(i18n._(t`Set a value for this field`)),
  });

  return (
    <>
      <FormField
        id="hostname"
        label={i18n._(t`Host Name`)}
        name="hostname"
        type="text"
        validate={required(null)}
        isRequired
        isDisabled={isEdit}
      />
      <FormField
        id="instance-description"
        label={i18n._(t`Description`)}
        name="description"
        type="text"
      />
      <FormField
        id="instance-state"
        label={i18n._(t`Instance State`)}
        name="node_state"
        type="text"
        tooltip={i18n._(
          t`Sets the current life cycle stage of this instance. Default is "installed."`
        )}
        isDisabled
      />
      <FormField
        id="instance-port"
        label={i18n._(t`Listener Port`)}
        name="listener_port"
        type="number"
        tooltip={i18n._(
          t`Select the port that Receptor will listen on for incoming connections, e.g. 27199.`
        )}
      />
      <FormGroup
        fieldId="instance-type"
        label={i18n._(t`Instance Type`)}
        tooltip={i18n._(
          t`Sets the role that this instance will play within mesh topology. Default is "execution."`
        )}
        validated={
          !instanceTypeMeta.touched || !instanceTypeMeta.error
            ? 'default'
            : 'error'
        }
        helperTextInvalid={instanceTypeMeta.error}
        isRequired
      >
        <AnsibleSelect
          {...instanceTypeField}
          id="node_type"
          data={INSTANCE_TYPES.map((type) => ({
            key: type.id,
            value: type.id,
            label: i18n._(type.name),
          }))}
          onChange={(event, value) => {
            instanceTypeHelpers.setValue(value);
          }}
          isDisabled={isEdit}
        />
      </FormGroup>
      <FormGroup
        fieldId="instance-option-checkboxes"
        label={i18n._(t`Options`)}
      >
        <CheckboxField
          id="enabled"
          name="enabled"
          label={i18n._(t`Enable Instance`)}
          tooltip={i18n._(
            t`Set the instance enabled or disabled. If disabled, jobs will not be assigned to this instance.`
          )}
        />
        <CheckboxField
          id="managed-by-policy"
          name="managed_by_policy"
          label={i18n._(t`Managed by Policy`)}
          tooltip={i18n._(
            t`Controls whether or not this instance is managed by policy. If enabled, the instance will be available for automatic assignment to and unassignment from instance groups based on policy rules.`
          )}
        />
        <CheckboxField
          id="peers_from_control_nodes"
          name="peers_from_control_nodes"
          label={i18n._(t`Peers from control nodes`)}
          tooltip={i18n._(
            t`If enabled, control nodes will peer to this instance automatically. If disabled, instance will be connected only to associated peers.`
          )}
        />
      </FormGroup>
    </>
  );
}

function InstanceForm({
  instance = {},
  instance_peers = [],
  isEdit = false,
  submitError,
  handleCancel,
  handleSubmit,
}) {
  return (
    <CardBody>
      <Formik
        initialValues={{
          hostname: instance.hostname || '',
          description: instance.description || '',
          node_type: instance.node_type || 'execution',
          node_state: instance.node_state || 'installed',
          listener_port: instance.listener_port,
          enabled: instance.enabled || true,
          managed_by_policy: instance.managed_by_policy || true,
          peers_from_control_nodes: instance.peers_from_control_nodes || false,
          peers: instance_peers,
        }}
        onSubmit={(values) => {
          handleSubmit({
            ...values,
            listener_port:
              values.listener_port === '' ? null : values.listener_port,
            peers: values.peers.map((peer) => peer.hostname || peer),
          });
        }}
      >
        {(formik) => (
          <Form autoComplete="off" onSubmit={formik.handleSubmit}>
            <FormColumnLayout>
              <InstanceFormFields isEdit={isEdit} />
              <FormSubmitError error={submitError} />
              <FormActionGroup
                onCancel={handleCancel}
                onSubmit={formik.handleSubmit}
              />
            </FormColumnLayout>
          </Form>
        )}
      </Formik>
    </CardBody>
  );
}

export default InstanceForm;
