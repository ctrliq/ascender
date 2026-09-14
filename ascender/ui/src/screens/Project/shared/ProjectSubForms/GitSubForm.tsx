import type { SummaryFieldRef } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import FormField from 'components/FormField';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';

import {
  UrlFormField,
  BranchFormField,
  ScmCredentialFormField,
  ScmTypeOptions,
} from './SharedFields';
import getProjectHelpStrings from '../Project.helptext';
import type { ProjectCredentialField } from '../ProjectForm';

export interface GitSubFormProps {
  credential: ProjectCredentialField;
  onCredentialSelection: (kind: string, value: SummaryFieldRef | null) => void;
  scmUpdateOnLaunch?: boolean;
  [key: string]: unknown;
}

const GitSubForm = ({
  credential,
  onCredentialSelection,
  scmUpdateOnLaunch,
}: GitSubFormProps) => {
  const { t } = useLingui();
  const docsURL = `${getDocsBaseUrl(
    useConfig()
  )}/userguide/projects.html#manage-playbooks-using-source-control`;
  const projectHelpStrings = getProjectHelpStrings();

  return (
    <>
      <UrlFormField tooltip={projectHelpStrings.githubSourceControlUrl} />
      <BranchFormField label={t`Source Control Branch/Tag/Commit`} />
      <FormField
        id="project-scm-refspec"
        label={t`Source Control Refspec`}
        name="scm_refspec"
        type="text"
        tooltipMaxWidth="400px"
        tooltip={projectHelpStrings.sourceControlRefspec(docsURL)}
      />
      <ScmCredentialFormField
        credential={credential}
        onCredentialSelection={onCredentialSelection}
      />
      <ScmTypeOptions scmUpdateOnLaunch={scmUpdateOnLaunch} />
    </>
  );
};

export default GitSubForm;
