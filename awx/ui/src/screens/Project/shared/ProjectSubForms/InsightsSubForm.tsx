import type { SummaryFieldRef, Untyped } from 'types/api';
import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField, useFormikContext } from 'formik';
import CredentialLookup from 'components/Lookup/CredentialLookup';
import { required } from 'util/validators';
import { ScmTypeOptions } from './SharedFields';

export interface InsightsSubFormProps {
  credential: { typeId: number; value: Untyped };
  onCredentialSelection: (kind: string, value: Untyped) => void;
  scmUpdateOnLaunch?: boolean;
  autoPopulateCredential?: boolean;
  [key: string]: unknown;
}

const InsightsSubForm = ({
  credential,
  onCredentialSelection,
  scmUpdateOnLaunch,
  autoPopulateCredential,
}: InsightsSubFormProps) => {
  const { t } = useLingui();
  const { setFieldValue, setFieldTouched } =
    useFormikContext<Record<string, unknown>>();
  const [, credMeta, credHelpers] = useField('credential');

  const onCredentialChange = useCallback(
    (value: SummaryFieldRef | null) => {
      onCredentialSelection('insights', value);
      setFieldValue('credential', value);
      setFieldTouched('credential', true, false);
    },
    [onCredentialSelection, setFieldValue, setFieldTouched]
  );

  return (
    <>
      <CredentialLookup
        credentialTypeId={credential.typeId}
        label={t`Insights Credential`}
        helperTextInvalid={credMeta.error}
        isValid={!credMeta.touched || !credMeta.error}
        onBlur={() => credHelpers.setTouched(true)}
        onChange={onCredentialChange}
        value={credential.value}
        required
        autoPopulate={autoPopulateCredential}
        validate={required(t`Select a value for this field`)}
      />
      <ScmTypeOptions hideAllowOverride scmUpdateOnLaunch={scmUpdateOnLaunch} />
    </>
  );
};

export default InsightsSubForm;
