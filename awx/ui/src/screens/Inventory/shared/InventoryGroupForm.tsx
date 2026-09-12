import type { Group } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';

import { Formik } from 'formik';
import { Form, Card } from '@patternfly/react-core';

import { CardBody } from 'components/Card';
import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import { VariablesField } from 'components/CodeEditor';
import { required } from 'util/validators';
import { FormColumnLayout, FormFullWidthLayout } from 'components/FormLayout';

/** A group as its own form holds it, before it is saved. */
export interface InventoryGroupFormValues {
  name: string;
  description: string;
  variables: string;
}

export interface InventoryGroupFormProps {
  error?: unknown;
  /** Absent on the add screen, which starts the form empty. */
  group?: Partial<Group>;
  handleSubmit: (values: InventoryGroupFormValues) => void;
  handleCancel: () => void;
}

function InventoryGroupForm({
  error,
  group = {},
  handleSubmit,
  handleCancel,
}: InventoryGroupFormProps) {
  const { t } = useLingui();
  const initialValues: InventoryGroupFormValues = {
    name: group.name || '',
    description: group.description || '',
    variables: group.variables || '---',
  };

  return (
    <Card>
      <CardBody>
        <Formik initialValues={initialValues} onSubmit={handleSubmit}>
          {(formik) => (
            <Form autoComplete="off" onSubmit={formik.handleSubmit}>
              <FormColumnLayout>
                <FormField
                  id="inventoryGroup-name"
                  name="name"
                  type="text"
                  label={t`Name`}
                  validate={required(null)}
                  isRequired
                />
                <FormField
                  id="inventoryGroup-description"
                  name="description"
                  type="text"
                  label={t`Description`}
                />
                <FormFullWidthLayout>
                  <VariablesField
                    id="host-variables"
                    name="variables"
                    label={t`Variables`}
                  />
                </FormFullWidthLayout>
                <FormActionGroup
                  onCancel={handleCancel}
                  onSubmit={formik.handleSubmit}
                />
                {Boolean(error) && <FormSubmitError error={error} />}
              </FormColumnLayout>
            </Form>
          )}
        </Formik>
      </CardBody>
    </Card>
  );
}

export default InventoryGroupForm;
