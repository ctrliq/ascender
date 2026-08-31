import React, { useCallback } from 'react';
import { useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import { FormGroup } from '@patternfly/react-core';
import { useConfig } from 'contexts/Config';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import AnsibleSelect from 'components/AnsibleSelect';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import Popover from 'components/Popover';
import { required } from 'util/validators';
import { VMWARE_PLUGIN_OPTIONS } from '../utils';
import {
  OptionsField,
  SourceVarsField,
  VerbosityField,
  EnabledVarField,
  EnabledValueField,
  HostFilterField,
} from './SharedFields';
import getHelpText from '../Inventory.helptext';

const VMwareSubForm = ({ autoPopulateCredential }) => {
  const { t } = useLingui();
  const helpText = getHelpText();
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');
  const [pluginField, , pluginHelpers] = useField('vmware_plugin');
  const config = useConfig();
  const handleCredentialUpdate = useCallback(
    (value) => {
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  const docsBaseUrl = getDocsBaseUrl(config);

  return (
    <>
      <CredentialLookup
        credentialTypeNamespace="vmware"
        label={t`Credential`}
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        onBlur={() => credentialHelpers.setTouched()}
        onChange={handleCredentialUpdate}
        value={credentialField.value}
        required
        autoPopulate={autoPopulateCredential}
        validate={required(t`Select a value for this field`)}
      />
      <FormGroup
        fieldId="vmware-plugin"
        label={t`Collection`}
        labelHelp={<Popover content={helpText.vmwarePlugin} />}
      >
        <AnsibleSelect
          id="vmware-plugin"
          data={VMWARE_PLUGIN_OPTIONS}
          {...pluginField}
          onChange={(event, value) => pluginHelpers.setValue(value)}
        />
      </FormGroup>
      <VerbosityField />
      <HostFilterField />
      <EnabledVarField />
      <EnabledValueField />
      <OptionsField />
      <SourceVarsField
        popoverContent={helpText.sourceVars(docsBaseUrl, 'vmware')}
      />
    </>
  );
};

export default VMwareSubForm;
