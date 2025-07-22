import React, { useEffect } from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useField } from 'formik';
import { FormGroup } from '@patternfly/react-core';
import { minMaxValue, regExp } from 'util/validators';
import AnsibleSelect from 'components/AnsibleSelect';
import { VariablesField } from 'components/CodeEditor';
import FormField, { CheckboxField } from 'components/FormField';
import { FormFullWidthLayout, FormCheckboxLayout } from 'components/FormLayout';
import Popover from 'components/Popover';
import getHelpText from '../Inventory.helptext';

export const SourceVarsField = ({ popoverContent }) => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <FormFullWidthLayout>
      <VariablesField
        id="source_vars"
        name="source_vars"
        label={i18n._(msg`Source variables`)}
        tooltip={
          <>
            {popoverContent}
            {helpText.variables()}
          </>
        }
      />
    </FormFullWidthLayout>
  );
};

export const VerbosityField = () => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const [field, meta, helpers] = useField('verbosity');
  const isValid = !(meta.touched && meta.error);
  const options = [
    { value: '0', key: '0', label: i18n._(msg`0 (Warning)`) },
    { value: '1', key: '1', label: i18n._(msg`1 (Info)`) },
    { value: '2', key: '2', label: i18n._(msg`2 (Debug)`) },
  ];

  return (
    <FormGroup
      fieldId="verbosity"
      validated={isValid ? 'default' : 'error'}
      label={i18n._(msg`Verbosity`)}
      labelIcon={<Popover content={helpText.subFormVerbosityFields} />}
    >
      <AnsibleSelect
        id="verbosity"
        data={options}
        {...field}
        onChange={(event, value) => helpers.setValue(value)}
      />
    </FormGroup>
  );
};

export const OptionsField = () => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const [updateOnLaunchField] = useField('update_on_launch');
  const [, , updateCacheTimeoutHelper] = useField('update_cache_timeout');
  const [projectField] = useField('source_project');

  useEffect(() => {
    if (!updateOnLaunchField.value) {
      updateCacheTimeoutHelper.setValue(0);
    }
  }, [updateOnLaunchField.value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <FormFullWidthLayout>
        <FormGroup
          fieldId="option-checkboxes"
          label={i18n._(msg`Update options`)}
        >
          <FormCheckboxLayout>
            <CheckboxField
              id="overwrite"
              name="overwrite"
              label={i18n._(msg`Overwrite`)}
              tooltip={helpText.subFormOptions.overwrite}
            />
            <CheckboxField
              id="overwrite_vars"
              name="overwrite_vars"
              label={i18n._(msg`Overwrite variables`)}
              tooltip={helpText.subFormOptions.overwriteVariables}
            />
            <CheckboxField
              id="update_on_launch"
              name="update_on_launch"
              label={i18n._(msg`Update on launch`)}
              tooltip={helpText.subFormOptions.updateOnLaunch(projectField)}
            />
          </FormCheckboxLayout>
        </FormGroup>
      </FormFullWidthLayout>
      {updateOnLaunchField.value && (
        <FormField
          id="cache-timeout"
          name="update_cache_timeout"
          type="number"
          min="0"
          max="2147483647"
          validate={minMaxValue(0, 2147483647)}
          label={i18n._(msg`Cache timeout (seconds)`)}
          tooltip={helpText.cachedTimeOut}
        />
      )}
    </>
  );
};

export const EnabledVarField = () => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <FormField
      id="inventory-enabled-var"
      label={i18n._(msg`Enabled Variable`)}
      tooltip={helpText.enabledVariableField}
      name="enabled_var"
      type="text"
    />
  );
};

export const EnabledValueField = () => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <FormField
      id="inventory-enabled-value"
      label={i18n._(msg`Enabled Value`)}
      tooltip={helpText.enabledValue}
      name="enabled_value"
      type="text"
    />
  );
};

export const HostFilterField = () => {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <FormField
      id="host-filter"
      label={i18n._(msg`Host Filter`)}
      tooltip={helpText.hostFilter}
      name="host_filter"
      type="text"
      validate={regExp()}
    />
  );
};
