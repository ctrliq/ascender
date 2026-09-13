import type { Host, SummaryFieldRef } from 'types/api';
import React, { useCallback } from 'react';
import { Formik, useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Tooltip,
} from '@patternfly/react-core';
import { required } from 'util/validators';
import FormField, { FormSubmitError } from '../FormField';
import FormActionGroup from '../FormActionGroup/FormActionGroup';
import { VariablesField } from '../CodeEditor';
import { InventoryLookup } from '../Lookup';
import { FormColumnLayout, FormFullWidthLayout } from '../FormLayout';
import Popover from '../Popover';

export interface InventoryLookupFieldProps {
  isDisabled: boolean;
  [key: string]: unknown;
}

const InventoryLookupField = ({ isDisabled }: InventoryLookupFieldProps) => {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } =
    useFormikContext<Record<string, unknown>>();
  const [inventoryField, inventoryMeta, inventoryHelpers] =
    useField('inventory');

  const handleInventoryUpdate = useCallback(
    (value: unknown) => {
      setFieldValue('inventory', value);
      setFieldTouched('inventory', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const renderInventoryLookup = (
    <InventoryLookup
      fieldId="inventory-lookup"
      value={inventoryField.value}
      onBlur={() => inventoryHelpers.setTouched(true)}
      tooltip={t`Select the inventory that this host will belong to.`}
      isValid={!inventoryMeta.touched || !inventoryMeta.error}
      helperTextInvalid={inventoryMeta.error}
      onChange={handleInventoryUpdate}
      required
      touched={inventoryMeta.touched}
      error={inventoryMeta.error}
      validate={required(t`Select a value for this field`)}
      isDisabled={isDisabled}
      hideAdvancedInventories
      autoPopulate={!inventoryField.value?.id}
    />
  );

  return (
    <FormGroup
      label={t`Inventory`}
      labelHelp={
        <Popover
          content={t`Select the inventory that this host will belong to.`}
        />
      }
      isRequired
      fieldId="inventory-lookup"
    >
      {isDisabled ? (
        <Tooltip content={t`Unable to change inventory on a host`}>
          {renderInventoryLookup}
        </Tooltip>
      ) : (
        renderInventoryLookup
      )}
      {inventoryMeta.touched && inventoryMeta.error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">
              {inventoryMeta.error}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
};

/** A host as its own form holds it, before it is saved. */
export interface HostFormValues {
  name: string;
  description: string;
  inventory: SummaryFieldRef | null;
  variables: string;
}

export interface HostFormProps {
  handleCancel: () => void;
  handleSubmit: (values: HostFormValues) => void;
  host?: Partial<Host>;
  isInventoryVisible?: boolean;
  submitError?: unknown;
  disableInventoryLookup?: boolean;
}

const HostForm = ({
  handleCancel,
  handleSubmit,
  host = {
    name: '',
    description: '',
    variables: '---\n',
    summary_fields: {},
  },
  isInventoryVisible = true,
  submitError = null,
  disableInventoryLookup = false,
}: HostFormProps) => {
  const { t } = useLingui();
  return (
    <Formik
      initialValues={{
        name: host.name ?? '',
        description: host.description ?? '',
        inventory: host.summary_fields?.inventory || null,
        variables: host.variables ?? '',
      }}
      onSubmit={handleSubmit}
    >
      {(formik) => (
        <Form autoComplete="off" onSubmit={formik.handleSubmit}>
          <FormColumnLayout>
            <FormField
              id="host-name"
              name="name"
              type="text"
              label={t`Name`}
              validate={required(null)}
              isRequired
            />
            <FormField
              id="host-description"
              name="description"
              type="text"
              label={t`Description`}
            />
            {isInventoryVisible && (
              <InventoryLookupField isDisabled={disableInventoryLookup} />
            )}
            <FormFullWidthLayout>
              <VariablesField
                id="host-variables"
                name="variables"
                label={t`Variables`}
              />
            </FormFullWidthLayout>
            {Boolean(submitError) && <FormSubmitError error={submitError} />}
            <FormActionGroup
              onCancel={handleCancel}
              onSubmit={formik.handleSubmit}
            />
          </FormColumnLayout>
        </Form>
      )}
    </Formik>
  );
};

export { HostForm as _HostForm };
export default HostForm;
