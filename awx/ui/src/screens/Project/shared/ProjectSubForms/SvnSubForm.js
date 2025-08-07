import 'styled-components/macro';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import getProjectHelpStrings from '../Project.helptext';

import {
  UrlFormField,
  BranchFormField,
  ScmCredentialFormField,
  ScmTypeOptions,
} from './SharedFields';

const SvnSubForm = ({
  credential,
  onCredentialSelection,
  scmUpdateOnLaunch,
}) => {
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
