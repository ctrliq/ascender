import React, { useCallback } from 'react';
import { Formik, useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import { required } from 'util/validators';
import { Form, FormGroup, FormHelperText,
HelperText,
HelperTextItem,
} from '@patternfly/react-core';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import { FormColumnLayout } from 'components/FormLayout';
import InventoryLookup from 'components/Lookup/InventoryLookup';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import Popover from 'components/Popover';

function FederatedInventoryFormFields({ inventory = {} }) {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } = useFormikContext();

  const [organizationField, organizationMeta, organizationHelpers] =
    useField('organization');
  const [inputInventoriesField, inputInventoriesMeta, inputInventoriesHelpers] =
    useField({
      name: 'inputInventories',
      validate: (value) => {
        if (value.length === 0) {
          return t`This field must not be blank`;
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
        label={t`Name`}
        name="name"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="description"
        label={t`Description`}
        name="description"
        type="text"
      />
      <OrganizationLookup
        autoPopulate={!inventory?.id}
        helperTextInvalid={organizationMeta.error}
        isValid={!organizationMeta.touched || !organizationMeta.error}
        onBlur={() => organizationHelpers.setTouched()}
        onChange={handleOrganizationUpdate}
        validate={required(t`Select a value for this field`)}
        value={organizationField.value}
        required
      />
      <FormGroup
        isRequired
        fieldId="input-inventories-lookup"
        id="input-inventories-lookup"
        label={t`Input Inventories`}
        labelHelp={
          <Popover
            content={t`Select the source inventories for this federated inventory. When a job is launched, hosts will be routed to each source inventory's instance group automatically.`}
          />
        }
      >
        <InventoryLookup
          fieldId="inputInventories"
          error={inputInventoriesMeta.error}
          onBlur={() => inputInventoriesHelpers.setTouched()}
          onChange={handleInputInventoriesUpdate}
          touched={inputInventoriesMeta.touched}
          value={inputInventoriesField.value}
          excludeIds={inventory?.id ? [inventory.id] : []}
          hideAdvancedInventories
          multiple
          required
        />
        {inputInventoriesMeta.touched && inputInventoriesMeta.error && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="error">
                {inputInventoriesMeta.error}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </>
  );
}

function FederatedInventoryForm({
  federatedInventory,
  inputInventories,
  onCancel,
  onSubmit,
  submitError = null,
}) {
  const initialValues = {
    kind: 'federated',
    description: federatedInventory?.description || '',
    inputInventories: inputInventories || [],
    name: federatedInventory?.name || '',
    organization: federatedInventory?.summary_fields?.organization || null,
  };

  return (
    <Formik initialValues={initialValues} onSubmit={onSubmit}>
      {(formik) => (
        <Form role="form" autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <FederatedInventoryFormFields inventory={federatedInventory} />
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

export default FederatedInventoryForm;
