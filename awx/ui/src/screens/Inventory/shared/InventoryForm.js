import React, { useCallback, useState } from 'react';
import { Formik, useField, useFormikContext } from 'formik';
import { msg } from '@lingui/macro';
import { func, shape } from 'prop-types';
import { Form, FormGroup } from '@patternfly/react-core';
import { VariablesField } from 'components/CodeEditor';
import Popover from 'components/Popover';
import FormField, {
  CheckboxField,
  FormSubmitError,
} from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup';
import { required } from 'util/validators';
import LabelSelect from 'components/LabelSelect';
import InstanceGroupsLookup from 'components/Lookup/InstanceGroupsLookup';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import ContentError from 'components/ContentError';
import {
  FormColumnLayout,
  FormFullWidthLayout,
  FormCheckboxLayout,
} from 'components/FormLayout';
import { useLingui } from '@lingui/react';
import useHelpText from './Inventory.helptext';

function InventoryFormFields({ inventory }) {
  const { i18n } = useLingui();
  const helpText = useHelpText();
  const [contentError, setContentError] = useState(false);
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const [organizationField, organizationMeta, organizationHelpers] =
    useField('organization');
  const [instanceGroupsField, , instanceGroupsHelpers] =
    useField('instanceGroups');
  const [labelsField, , labelsHelpers] = useField('labels');
  const handleOrganizationUpdate = useCallback(
    (value) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  return (
    <>
      <FormField
        id="inventory-name"
        label={i18n._(msg`Name`)}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="inventory-description"
        label={i18n._(msg`Description`)}
        name="description"
        type="text"
      />
      <OrganizationLookup
        helperTextInvalid={organizationMeta.error}
        isValid={!organizationMeta.touched || !organizationMeta.error}
        onBlur={() => organizationHelpers.setTouched()}
        onChange={handleOrganizationUpdate}
        value={organizationField.value}
        touched={organizationMeta.touched}
        error={organizationMeta.error}
        required
        autoPopulate={!inventory?.id}
        validate={required(i18n._(msg`Select a value for this field`))}
      />
      <InstanceGroupsLookup
        value={instanceGroupsField.value}
        onChange={(value) => {
          instanceGroupsHelpers.setValue(value);
        }}
        fieldName="instanceGroups"
      />
      <FormFullWidthLayout>
        <FormGroup
          label={i18n._(msg`Labels`)}
          labelIcon={<Popover content={helpText.labels} />}
          fieldId="inventory-labels"
        >
          <LabelSelect
            value={labelsField.value}
            onChange={(labels) => labelsHelpers.setValue(labels)}
            onError={setContentError}
            createText={i18n._(msg`Create`)}
          />
        </FormGroup>
        <FormGroup
          fieldId="inventory-option-checkboxes"
          label={i18n._(msg`Options`)}
        >
          <FormCheckboxLayout>
            <CheckboxField
              id="option-prevent-instance-group-fallback"
              name="prevent_instance_group_fallback"
              label={i18n._(msg`Prevent Instance Group Fallback`)}
              tooltip={helpText.preventInstanceGroupFallback}
            />
          </FormCheckboxLayout>
        </FormGroup>
        <VariablesField
          tooltip={helpText.variables()}
          id="inventory-variables"
          name="variables"
          label={i18n._(msg`Variables`)}
        />
      </FormFullWidthLayout>
    </>
  );
}

function InventoryForm({
  inventory = {},
  onSubmit,
  onCancel,
  submitError,
  instanceGroups,
  ...rest
}) {
  const initialValues = {
    name: inventory.name || '',
    description: inventory.description || '',
    variables: inventory.variables || '---',
    organization:
      (inventory.summary_fields && inventory.summary_fields.organization) ||
      null,
    instanceGroups: instanceGroups || [],
    labels: inventory?.summary_fields?.labels?.results || [],
    prevent_instance_group_fallback:
      inventory.prevent_instance_group_fallback || false,
  };
  return (
    <Formik
      initialValues={initialValues}
      onSubmit={(values) => {
        onSubmit(values);
      }}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <InventoryFormFields {...rest} inventory={inventory} />
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

InventoryForm.propType = {
  handleSubmit: func.isRequired,
  handleCancel: func.isRequired,
  instanceGroups: shape(),
  inventory: shape(),
  submitError: shape(),
};

InventoryForm.defaultProps = {
  inventory: {},
  instanceGroups: [],
  submitError: null,
};

export default InventoryForm;
