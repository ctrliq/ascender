import React, { useCallback } from 'react';
import { Formik, useField, useFormikContext } from 'formik';
import { func, shape } from 'prop-types';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { minMaxValue, required } from 'util/validators';
import { Form, FormGroup } from '@patternfly/react-core';
import { VariablesField } from 'components/CodeEditor';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import { FormFullWidthLayout, FormColumnLayout } from 'components/FormLayout';
import InstanceGroupsLookup from 'components/Lookup/InstanceGroupsLookup';
import InventoryLookup from 'components/Lookup/InventoryLookup';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import Popover from 'components/Popover';
import { VerbositySelectField } from 'components/VerbositySelectField';

import ConstructedInventoryHint from './ConstructedInventoryHint';
import getInventoryHelpTextStrings from './Inventory.helptext';

function ConstructedInventoryFormFields({ inventory = {}, options }) {
  const { i18n } = useLingui();
  const helpText = getInventoryHelpTextStrings();
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const constructedPluginValidator = {
    plugin: required(i18n._(msg`The plugin parameter is required.`)),
  };

  const [instanceGroupsField, , instanceGroupsHelpers] =
    useField('instanceGroups');
  const [organizationField, organizationMeta, organizationHelpers] =
    useField('organization');
  const [inputInventoriesField, inputInventoriesMeta, inputInventoriesHelpers] =
    useField({
      name: 'inputInventories',
      validate: (value) => {
        if (value.length === 0) {
          return i18n._(msg`This field must not be blank`);
        }
        return undefined;
      },
    });
  const handleOrganizationUpdate = useCallback(
    (value) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );
  const handleInputInventoriesUpdate = useCallback(
    (value) => {
      setFieldValue('inputInventories', value);
      setFieldTouched('inputInventories', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <FormField
        id="name"
        label={i18n._(msg`Name`)}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="description"
        label={i18n._(msg`Description`)}
        name="description"
        type="text"
      />
      <OrganizationLookup
        autoPopulate={!inventory?.id}
        helperTextInvalid={organizationMeta.error}
        isValid={!organizationMeta.touched || !organizationMeta.error}
        onBlur={() => organizationHelpers.setTouched()}
        onChange={handleOrganizationUpdate}
        validate={required(i18n._(msg`Select a value for this field`))}
        value={organizationField.value}
        required
      />
      <InstanceGroupsLookup
        value={instanceGroupsField.value}
        onChange={(value) => {
          instanceGroupsHelpers.setValue(value);
        }}
        tooltip={i18n._(
          msg`Select the Instance Groups for this Inventory to run on.`
        )}
      />
      <FormGroup
        isRequired
        fieldId="input-inventories-lookup"
        id="input-inventories-lookup"
        helperTextInvalid={inputInventoriesMeta.error}
        label={i18n._(msg`Input Inventories`)}
        labelIcon={
          <Popover
            content={i18n._(
              msg`Select Input Inventories for the constructed inventory plugin.`
            )}
          />
        }
        validated={
          !inputInventoriesMeta.touched || !inputInventoriesMeta.error
            ? 'default'
            : 'error'
        }
      >
        <InventoryLookup
          fieldId="inputInventories"
          error={inputInventoriesMeta.error}
          onBlur={() => inputInventoriesHelpers.setTouched()}
          onChange={handleInputInventoriesUpdate}
          touched={inputInventoriesMeta.touched}
          value={inputInventoriesField.value}
          hideAdvancedInventories
          multiple
          required
        />
      </FormGroup>
      <FormField
        id="cache-timeout"
        label={i18n._(msg`Cache timeout (seconds)`)}
        max="2147483647"
        min="0"
        name="update_cache_timeout"
        tooltip={options.update_cache_timeout.help_text}
        type="number"
        validate={minMaxValue(0, 2147483647)}
      />
      <VerbositySelectField
        fieldId="verbosity"
        tooltip={options.verbosity.help_text}
      />
      <FormFullWidthLayout>
        <ConstructedInventoryHint />
      </FormFullWidthLayout>
      <FormField
        id="limit"
        label={i18n._(msg`Limit`)}
        name="limit"
        type="text"
        tooltip={options.limit.help_text}
      />
      <FormFullWidthLayout>
        <VariablesField
          id="source_vars"
          name="source_vars"
          label={i18n._(msg`Source vars`)}
          tooltip={helpText.constructedInventorySourceVars()}
          validators={constructedPluginValidator}
          isRequired
        />
      </FormFullWidthLayout>
    </>
  );
}

function ConstructedInventoryForm({
  constructedInventory,
  instanceGroups,
  inputInventories,
  onCancel,
  onSubmit,
  submitError,
  options,
}) {
  const initialValues = {
    kind: 'constructed',
    description: constructedInventory?.description || '',
    instanceGroups: instanceGroups || [],
    inputInventories: inputInventories || [],
    limit: constructedInventory?.limit || '',
    name: constructedInventory?.name || '',
    organization: constructedInventory?.summary_fields?.organization || null,
    update_cache_timeout: constructedInventory?.update_cache_timeout || 0,
    verbosity: constructedInventory?.verbosity || 0,
    source_vars: constructedInventory?.source_vars || '---',
  };

  return (
    <Formik initialValues={initialValues} onSubmit={onSubmit}>
      {(formik) => (
        <Form role="form" autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <ConstructedInventoryFormFields options={options} />
            {submitError && <FormSubmitError error={submitError} />}
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

ConstructedInventoryForm.propTypes = {
  onCancel: func.isRequired,
  onSubmit: func.isRequired,
  submitError: shape({}),
};

ConstructedInventoryForm.defaultProps = {
  submitError: null,
};

export default ConstructedInventoryForm;
