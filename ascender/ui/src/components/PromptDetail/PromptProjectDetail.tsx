import type { Project } from 'types/api';
import React from 'react';
import { Plural, useLingui } from '@lingui/react/macro';
import { Content, ContentVariants } from '@patternfly/react-core';
import { Link } from 'react-router';
import { Config } from 'contexts/Config';
import { toTitleCase } from 'util/strings';
import { Detail, DeletedDetail } from '../DetailList';
import CredentialChip from '../CredentialChip';
import ExecutionEnvironmentDetail from '../ExecutionEnvironmentDetail';

export interface PromptProjectDetailProps {
  resource: Project;
  [key: string]: unknown;
}

function PromptProjectDetail({ resource }: PromptProjectDetailProps) {
  const { t } = useLingui();
  const {
    allow_override,
    local_path,
    scm_branch,
    scm_clean,
    scm_delete_on_update,
    scm_track_submodules,
    scm_refspec,
    scm_type,
    scm_update_on_launch,
    scm_update_cache_timeout,
    scm_url,
    summary_fields,
    webhook_service,
  } = resource;

  let optionsList: React.ReactNode = '';
  if (
    scm_clean ||
    scm_delete_on_update ||
    scm_track_submodules ||
    scm_update_on_launch ||
    allow_override ||
    webhook_service
  ) {
    optionsList = (
      <Content component={ContentVariants.ul}>
        {scm_clean && (
          <Content component={ContentVariants.li}>{t`Clean`}</Content>
        )}
        {scm_delete_on_update && (
          <Content component={ContentVariants.li}>{t`Delete`}</Content>
        )}
        {scm_track_submodules && (
          <Content component={ContentVariants.li}>
            {t`Track Submodules`}
          </Content>
        )}
        {scm_update_on_launch && (
          <Content component={ContentVariants.li}>
            {t`Update Revision on Launch`}
          </Content>
        )}
        {allow_override && (
          <Content component={ContentVariants.li}>
            {t`Allow Branch Override`}
          </Content>
        )}
        {webhook_service && (
          <Content component={ContentVariants.li}>{t`Enable Webhook`}</Content>
        )}
      </Content>
    );
  }

  const prefixCy = 'prompt-project-detail';
  return (
    <>
      {summary_fields?.organization ? (
        <Detail
          label={t`Organization`}
          dataCy={`${prefixCy}-organization`}
          value={
            <Link
              to={`/organizations/${summary_fields.organization.id}/details`}
            >
              {summary_fields?.organization.name}
            </Link>
          }
        />
      ) : (
        <DeletedDetail label={t`Organization`} />
      )}
      <ExecutionEnvironmentDetail
        executionEnvironment={summary_fields?.default_environment}
        isDefaultEnvironment
      />
      <Detail
        label={t`Source Control Type`}
        dataCy={`${prefixCy}-source-control-type`}
        value={scm_type === '' ? t`Manual` : toTitleCase(scm_type)}
      />
      <Detail
        label={t`Source Control URL`}
        dataCy={`${prefixCy}-source-control-url`}
        value={scm_url}
      />
      <Detail
        /* Named as the project form names it for this kind of project. */
        label={
          scm_type === 'svn'
            ? t`Revision #`
            : t`Source Control Branch/Tag/Commit`
        }
        dataCy={`${prefixCy}-source-control-branch`}
        value={scm_branch}
      />
      <Detail
        label={t`Source Control Refspec`}
        dataCy={`${prefixCy}-source-control-refspec`}
        value={scm_refspec}
      />
      {summary_fields?.credential?.id && (
        <Detail
          label={t`Source Control Credential`}
          dataCy={`${prefixCy}-source-control-credential`}
          value={
            <CredentialChip
              key={summary_fields.credential.id}
              credential={summary_fields.credential}
              isReadOnly
            />
          }
        />
      )}
      {summary_fields?.signature_validation_credential?.id && (
        <Detail
          label={t`Content Signature Validation Credential`}
          dataCy={`${prefixCy}-content-signature-validation-credential`}
          value={
            <CredentialChip
              key={summary_fields.signature_validation_credential.id}
              credential={summary_fields.signature_validation_credential}
              isReadOnly
            />
          }
        />
      )}
      {optionsList && (
        <Detail
          label={t`Options`}
          dataCy={`${prefixCy}-options`}
          value={optionsList}
        />
      )}
      <Detail
        label={t`Cache Timeout`}
        dataCy={`${prefixCy}-cache-timeout`}
        value={
          <Plural
            value={scm_update_cache_timeout}
            one="# second"
            other="# seconds"
          />
        }
      />
      <Config>
        {({ project_base_dir }) => (
          <Detail
            label={t`Project Base Path`}
            dataCy={`${prefixCy}-project-base-path`}
            value={project_base_dir as string}
          />
        )}
      </Config>
      <Detail
        label={t`Playbook Directory`}
        dataCy={`${prefixCy}-playbook-directory`}
        value={local_path}
      />
    </>
  );
}

export default PromptProjectDetail;
