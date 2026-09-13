import type { AnyInventory, Inventory, SummaryFieldRef } from 'types/api';
import React, { useCallback } from 'react';
import { Formik, useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import { required } from 'util/validators';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import FormField, { FormSubmitError } from 'components/FormField';
import { FormColumnLayout } from 'components/FormLayout';
import InventoryLookup from 'components/Lookup/InventoryLookup';
import OrganizationLookup from 'components/Lookup/OrganizationLookup';
import Popover from 'components/Popover';

export interface FederatedInventoryFormFieldsProps {
  inventory?: Partial<Inventory>;
  [key: string]: unknown;
}

function FederatedInventoryFormFields({
  inventory,
}: FederatedInventoryFormFieldsProps) {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } =
    useFormikContext<Record<string, unknown>>();

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
    (value: SummaryFieldRef | null) => {
      setFieldValue('organization', value);
      setFieldTouched('organization', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const handleInputInventoriesUpdate = useCallback(
    (value: SummaryFieldRef | null) => {
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
        onBlur={() => organizationHelpers.setTouched(true)}
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
          onBlur={() => inputInventoriesHelpers.setTouched(true)}
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

/**
 * What the federated inventory form holds: its own fields, and the
 * inventories it federates, which are associated one by one on save.
 */
export interface FederatedInventoryFormValues {
  kind: string;
  description: string;
  inputInventories: AnyInventory[];
  name: string;
  organization?: SummaryFieldRef | null;
}

export interface FederatedInventoryFormProps {
  federatedInventory?: Partial<Inventory>;
  /** The inventories it already federates, which seed the lookup. */
  inputInventories?: AnyInventory[];
  onCancel: () => void;
  onSubmit: (values: FederatedInventoryFormValues) => void;
  submitError?: unknown;
}

function FederatedInventoryForm({
  federatedInventory,
  inputInventories,
  onCancel,
  onSubmit,
  submitError = null,
}: FederatedInventoryFormProps) {
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
            {Boolean(submitError) && <FormSubmitError error={submitError} />}
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
