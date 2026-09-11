import type { Untyped } from 'types/api';
import React from 'react';
import getProjectHelpText from '../Project.helptext';

import {
  UrlFormField,
  ScmCredentialFormField,
  ScmTypeOptions,
} from './SharedFields';

export interface ArchiveSubFormProps {
  credential: Untyped;
  onCredentialSelection: (...args: Untyped[]) => void;
  scmUpdateOnLaunch: Untyped;
  [key: string]: unknown;
}

const ArchiveSubForm = ({
  credential,
  onCredentialSelection,
  scmUpdateOnLaunch,
}: ArchiveSubFormProps) => {
  const projectHelpText = getProjectHelpText();
  return (
    <>
      <UrlFormField tooltip={projectHelpText.archiveUrl} />
      <ScmCredentialFormField
        credential={credential}
        onCredentialSelection={onCredentialSelection}
      />
      <ScmTypeOptions scmUpdateOnLaunch={scmUpdateOnLaunch} />
    </>
  );
};

export default ArchiveSubForm;
