import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Formik } from 'formik';
import { Form, Card } from '@patternfly/react-core';

import { CardBody } from 'components/Card';
import FormField, { FormSubmitError } from 'components/FormField';
import FormActionGroup from 'components/FormActionGroup/FormActionGroup';
import { VariablesField } from 'components/CodeEditor';
import { required } from 'util/validators';
import { FormColumnLayout, FormFullWidthLayout } from 'components/FormLayout';

function InventoryGroupForm({ error, group = {}, handleSubmit, handleCancel }) {
  const { i18n } = useLingui();
  const initialValues = {
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
                  label={i18n._(msg`Name`)}
                  validate={required(null)}
                  isRequired
                />
                <FormField
                  id="inventoryGroup-description"
                  name="description"
                  type="text"
                  label={i18n._(msg`Description`)}
                />
                <FormFullWidthLayout>
                  <VariablesField
                    id="host-variables"
                    name="variables"
                    label={i18n._(msg`Variables`)}
                  />
                </FormFullWidthLayout>
                <FormActionGroup
                  onCancel={handleCancel}
                  onSubmit={formik.handleSubmit}
                />
                {error && <FormSubmitError error={error} />}
              </FormColumnLayout>
            </Form>
          )}
        </Formik>
      </CardBody>
    </Card>
  );
}

export default InventoryGroupForm;
