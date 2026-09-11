import type { Credential, Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import getProjectHelpStrings from '../Project.helptext';

import {
  UrlFormField,
  BranchFormField,
  ScmCredentialFormField,
  ScmTypeOptions,
} from './SharedFields';

export interface SvnSubFormProps {
  credential: Credential;
  onCredentialSelection: (kind: string, value: Untyped) => void;
  scmUpdateOnLaunch: boolean;
  [key: string]: unknown;
}

const SvnSubForm = ({
  credential,
  onCredentialSelection,
  scmUpdateOnLaunch,
}: SvnSubFormProps) => {
  const { t } = useLingui();
  const projectHelpStrings = getProjectHelpStrings();
  return (
    <>
      <UrlFormField tooltip={projectHelpStrings.svnSourceControlUrl} />
      <BranchFormField label={t`Revision #`} />
      <ScmCredentialFormField
        credential={credential}
        onCredentialSelection={onCredentialSelection}
      />
      <ScmTypeOptions scmUpdateOnLaunch={scmUpdateOnLaunch} />
    </>
  );
};

export default SvnSubForm;
