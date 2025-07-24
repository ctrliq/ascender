import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  TextList,
  TextListItem,
  TextListVariants,
  TextListItemVariants,
} from '@patternfly/react-core';
import { Link } from 'react-router-dom';
import { Config } from 'contexts/Config';
import { toTitleCase } from 'util/strings';
import { Detail, DeletedDetail } from '../DetailList';
import CredentialChip from '../CredentialChip';
import ExecutionEnvironmentDetail from '../ExecutionEnvironmentDetail';

function PromptProjectDetail({ resource }) {
  const { i18n } = useLingui();
  const {
    allow_override,
    custom_virtualenv,
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
  } = resource;

  let optionsList = '';
  if (
    scm_clean ||
    scm_delete_on_update ||
    scm_track_submodules ||
    scm_update_on_launch ||
    allow_override
  ) {
    optionsList = (
      <TextList component={TextListVariants.ul}>
        {scm_clean && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Discard local changes before syncing`)}
          </TextListItem>
        )}
        {scm_delete_on_update && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Delete the project before syncing`)}
          </TextListItem>
        )}
        {scm_track_submodules && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Track submodules latest commit on branch`)}
          </TextListItem>
        )}
        {scm_update_on_launch && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Update revision on job launch`)}
          </TextListItem>
        )}
        {allow_override && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Allow branch override`)}
          </TextListItem>
        )}
      </TextList>
    );
  }

  const prefixCy = 'prompt-project-detail';
  return (
    <>
      {summary_fields?.organization ? (
        <Detail
          label={i18n._(msg`Organization`)}
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
        <DeletedDetail label={i18n._(msg`Organization`)} />
      )}
      <ExecutionEnvironmentDetail
        virtualEnvironment={custom_virtualenv}
        executionEnvironment={summary_fields?.default_environment}
        isDefaultEnvironment
      />
      <Detail
        label={i18n._(msg`Source Control Type`)}
        dataCy={`${prefixCy}-source-control-type`}
        value={scm_type === '' ? i18n._(msg`Manual`) : toTitleCase(scm_type)}
      />
      <Detail
        label={i18n._(msg`Source Control URL`)}
        dataCy={`${prefixCy}-source-control-url`}
        value={scm_url}
      />
      <Detail
        label={i18n._(msg`Source Control Branch`)}
        dataCy={`${prefixCy}-source-control-branch`}
        value={scm_branch}
      />
      <Detail
        label={i18n._(msg`Source Control Refspec`)}
        dataCy={`${prefixCy}-source-control-refspec`}
        value={scm_refspec}
      />
      {summary_fields?.credential?.id && (
        <Detail
          label={i18n._(msg`Source Control Credential`)}
          dataCy={`${prefixCy}-source-control-credential`}
          value={
            <CredentialChip
              key={resource.summary_fields.credential.id}
              credential={resource.summary_fields.credential}
              isReadOnly
            />
          }
        />
      )}
      {summary_fields?.signature_validation_credential?.id && (
        <Detail
          label={i18n._(msg`Content Signature Validation Credential`)}
          dataCy={`${prefixCy}-content-signature-validation-credential`}
          value={
            <CredentialChip
              key={resource.summary_fields.signature_validation_credential.id}
              credential={
                resource.summary_fields.signature_validation_credential
              }
              isReadOnly
            />
          }
        />
      )}
      {optionsList && (
        <Detail
          label={i18n._(msg`Enabled Options`)}
          dataCy={`${prefixCy}-enabled-options`}
          value={optionsList}
        />
      )}
      <Detail
        label={i18n._(msg`Cache Timeout`)}
        dataCy={`${prefixCy}-cache-timeout`}
        value={`${scm_update_cache_timeout} ${i18n._(msg`Seconds`)}`}
      />
      <Config>
        {({ project_base_dir }) => (
          <Detail
            label={i18n._(msg`Project Base Path`)}
            dataCy={`${prefixCy}-project-base-path`}
            value={project_base_dir}
          />
        )}
      </Config>
      <Detail
        label={i18n._(msg`Playbook Directory`)}
        dataCy={`${prefixCy}-playbook-directory`}
        value={local_path}
      />
    </>
  );
}

export default PromptProjectDetail;
