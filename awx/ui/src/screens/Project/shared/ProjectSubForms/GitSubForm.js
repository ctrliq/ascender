import 'styled-components/macro';
import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
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

const GitSubForm = ({
  credential,
  onCredentialSelection,
  scmUpdateOnLaunch,
}) => {
  const { i18n } = useLingui();
  const docsURL = `${getDocsBaseUrl(
    useConfig()
  )}/html/userguide/projects.html#manage-playbooks-using-source-control`;
  const projectHelpStrings = getProjectHelpStrings(i18n);

  return (
    <>
      <UrlFormField tooltip={projectHelpStrings.githubSourceControlUrl} />
      <BranchFormField label={i18n._(msg`Source Control Branch/Tag/Commit`)} />
      <FormField
        id="project-scm-refspec"
        label={i18n._(msg`Source Control Refspec`)}
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
