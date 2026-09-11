import type { Untyped } from 'types/api';
import React, { useCallback } from 'react';
import { useField, useFormikContext } from 'formik';
import { useLingui } from '@lingui/react/macro';
import { useConfig } from 'contexts/Config';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import { required } from 'util/validators';
import {
  OptionsField,
  SourceVarsField,
  VerbosityField,
  EnabledVarField,
  EnabledValueField,
  HostFilterField,
} from './SharedFields';
import getHelpText from '../Inventory.helptext';

export interface OpenStackSubFormProps {
  autoPopulateCredential?: boolean;
  [key: string]: unknown;
}

const OpenStackSubForm = ({
  autoPopulateCredential,
}: OpenStackSubFormProps) => {
  const { t } = useLingui();
  const helpText = getHelpText();
  const { setFieldValue, setFieldTouched } =
    useFormikContext<Record<string, unknown>>();
  const [credentialField, credentialMeta, credentialHelpers] =
    useField('credential');
  const config = useConfig();

  const handleCredentialUpdate = useCallback(
    (value: Untyped) => {
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [setFieldValue, setFieldTouched]
  );

  return (
    <>
      <CredentialLookup
        credentialTypeNamespace="openstack"
        label={t`Credential`}
        helperTextInvalid={credentialMeta.error}
        isValid={!credentialMeta.touched || !credentialMeta.error}
        onBlur={() => credentialHelpers.setTouched(true)}
        onChange={handleCredentialUpdate}
        value={credentialField.value}
        required
        autoPopulate={autoPopulateCredential}
        validate={required(t`Select a value for this field`)}
      />
      <VerbosityField />
      <HostFilterField />
      <EnabledVarField />
      <EnabledValueField />
      <OptionsField />
      <SourceVarsField
        popoverContent={helpText.sourceVars(
          getDocsBaseUrl(config),
          'openstack'
        )}
      />
    </>
  );
};

export default OpenStackSubForm;
