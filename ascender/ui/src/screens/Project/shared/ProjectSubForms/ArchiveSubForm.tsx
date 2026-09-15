import type { SummaryFieldRef } from 'types/api';
import React from 'react';
import getProjectHelpText from '../Project.helptext';

import {
  UrlFormField,
  ScmCredentialFormField,
  ScmTypeOptions,
} from './SharedFields';
import type { ProjectCredentialField } from '../ProjectForm';

export interface ArchiveSubFormProps {
  credential: ProjectCredentialField;
  onCredentialSelection: (kind: string, value: SummaryFieldRef | null) => void;
  scmUpdateOnLaunch?: boolean;
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
