import type { SummaryFieldRef } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import getProjectHelpStrings from '../Project.helptext';

import {
  UrlFormField,
  BranchFormField,
  ScmCredentialFormField,
  ScmTypeOptions,
} from './SharedFields';
import type { ProjectCredentialField } from '../ProjectForm';

export interface SvnSubFormProps {
  credential: ProjectCredentialField;
  onCredentialSelection: (kind: string, value: SummaryFieldRef | null) => void;
  scmUpdateOnLaunch?: boolean;
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
