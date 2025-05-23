import 'styled-components/macro';
import React from 'react';
import { shape } from 'prop-types';
import { msg, Trans } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { Chip, Divider, Title } from '@patternfly/react-core';
import { toTitleCase } from 'util/strings';
import InstanceGroupLabels from 'components/InstanceGroupLabels';
import CredentialChip from '../CredentialChip';
import ChipGroup from '../ChipGroup';
import { DetailList, Detail, UserDateDetail } from '../DetailList';
import { VariablesDetail } from '../CodeEditor';
import PromptProjectDetail from './PromptProjectDetail';
import PromptInventorySourceDetail from './PromptInventorySourceDetail';
import PromptJobTemplateDetail from './PromptJobTemplateDetail';
import PromptWFJobTemplateDetail from './PromptWFJobTemplateDetail';
import { VERBOSITY } from '../VerbositySelectField';

const PromptTitle = styled(Title)`
  margin-top: var(--pf-global--spacer--xl);
  --pf-c-title--m-md--FontWeight: 700;
  grid-column: 1 / -1;
`;

const PromptDivider = styled(Divider)`
  margin-top: var(--pf-global--spacer--lg);
  margin-bottom: var(--pf-global--spacer--lg);
`;

const PromptDetailList = styled(DetailList)`
  padding: 0px var(--pf-global--spacer--lg);
`;

function formatTimeout(timeout) {
  if (typeof timeout === 'undefined' || timeout === null) {
    return null;
  }
  if (typeof timeout === 'string') {
    return timeout;
  }
  const minutes = Math.floor(timeout / 60);
  const seconds = timeout - Math.floor(timeout / 60) * 60;
  return (
    <Trans>
      {minutes} min {seconds} sec
    </Trans>
  );
}

function buildResourceLink(resource) {
  const link = {
    job_template: `/templates/job_template/${resource.id}/details`,
    project: `/projects/${resource.id}/details`,
    inventory_source: `/inventories/inventory/${resource.inventory}/sources/${resource.id}/details`,
    workflow_job_template: `/templates/workflow_job_template/${resource.id}/details`,
  };

  return link[resource?.type] ? (
    <Link to={link[resource.type]}>{resource.name}</Link>
  ) : (
    resource.name
  );
}

function hasPromptData(launchData) {
  return (
    launchData.survey_enabled ||
    launchData.ask_credential_on_launch ||
    launchData.ask_diff_mode_on_launch ||
    launchData.ask_inventory_on_launch ||
    launchData.ask_job_type_on_launch ||
    launchData.ask_limit_on_launch ||
    launchData.ask_scm_branch_on_launch ||
    launchData.ask_skip_tags_on_launch ||
    launchData.ask_tags_on_launch ||
    launchData.ask_variables_on_launch ||
    launchData.ask_verbosity_on_launch ||
    launchData.ask_execution_environment_on_launch ||
    launchData.ask_labels_on_launch ||
    launchData.ask_forks_on_launch ||
    launchData.ask_job_slice_count_on_launch ||
    launchData.ask_timeout_on_launch ||
    launchData.ask_instance_groups_on_launch
  );
}

function omitOverrides(resource, overrides, defaultConfig) {
  const clonedResource = {
    ...resource,
    summary_fields: { ...resource.summary_fields },
    ...defaultConfig,
  };
  Object.keys(overrides).forEach((keyToOmit) => {
    delete clonedResource[keyToOmit];
    delete clonedResource?.summary_fields[keyToOmit];
  });
  return clonedResource;
}

function PromptDetail({
  resource,
  launchConfig = {},
  overrides = {},
  workflowNode = false,
}) {
  const { i18n } = useLingui();
  const details = omitOverrides(resource, overrides, launchConfig.defaults);
  details.type = overrides?.nodeType || details.type;
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <>
      <DetailList gutter="sm">
        <Detail
          label={i18n._(msg`Name`)}
          dataCy="prompt-detail-name"
          value={buildResourceLink(resource)}
        />
        <Detail
          label={i18n._(msg`Description`)}
          dataCy="prompt-detail-description"
          value={details.description}
        />
        <Detail
          label={i18n._(msg`Type`)}
          dataCy="prompt-detail-type"
          value={toTitleCase(details.unified_job_type || details.type)}
        />
        {workflowNode && (
          <Detail
            label={i18n._(msg`Convergence`)}
            dataCy="prompt-detail-convergence"
            value={workflowNode?.all_parents_must_converge ? i18n._(msg`All`) : i18n._(msg`Any`)}
          />
        )}
        <Detail
          label={i18n._(msg`Timeout`)}
          dataCy="prompt-detail-timeout"
          value={formatTimeout(details?.timeout)}
        />
        {details?.type === 'project' && (
          <PromptProjectDetail resource={details} />
        )}
        {details?.type === 'inventory_source' && (
          <PromptInventorySourceDetail resource={details} />
        )}
        {details?.type === 'job_template' && (
          <PromptJobTemplateDetail resource={details} />
        )}
        {details?.type === 'workflow_job_template' && (
          <PromptWFJobTemplateDetail resource={details} />
        )}
        {details?.created && (
          <UserDateDetail
            label={i18n._(msg`Created`)}
            date={details.created}
            user={details?.summary_fields?.created_by}
          />
        )}
        {details?.modified && (
          <UserDateDetail
            label={i18n._(msg`Last Modified`)}
            date={details?.modified}
            user={details?.summary_fields?.modified_by}
          />
        )}
        {details?.type === 'system_job_template' && (
          <VariablesDetail
            label={i18n._(msg`Variables`)}
            rows={4}
            value={overrides.extra_vars}
            name="extra_vars"
            dataCy="prompt-detail-variables"
          />
        )}
      </DetailList>
      {details?.type !== 'system_job_template' &&
        hasPromptData(launchConfig) &&
        hasOverrides && (
          <>
            <PromptTitle headingLevel="h2">{i18n._(msg`Prompted Values`)}</PromptTitle>
            <PromptDivider />
            <PromptDetailList aria-label={i18n._(msg`Prompt Overrides`)}>
              {launchConfig.ask_job_type_on_launch && (
                <Detail
                  label={i18n._(msg`Job Type`)}
                  value={toTitleCase(overrides.job_type)}
                />
              )}
              {launchConfig.ask_credential_on_launch && (
                <Detail
                  fullWidth
                  label={i18n._(msg`Credentials`)}
                  rows={4}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={overrides.credentials.length}
                      ouiaId="prompt-credential-chips"
                    >
                      {overrides.credentials.map((cred) => (
                        <CredentialChip
                          key={cred.id}
                          credential={cred}
                          isReadOnly
                          ouiaId={`credential-${cred.id}-chip`}
                        />
                      ))}
                    </ChipGroup>
                  }
                />
              )}
              {launchConfig.ask_inventory_on_launch && (
                <Detail
                  label={i18n._(msg`Inventory`)}
                  value={overrides.inventory?.name}
                />
              )}
              {launchConfig.ask_execution_environment_on_launch && (
                <Detail
                  label={i18n._(msg`Execution Environment`)}
                  value={overrides.execution_environment?.name}
                />
              )}
              {launchConfig.ask_instance_groups_on_launch && (
                <Detail
                  fullWidth
                  label={i18n._(msg`Instance Groups`)}
                  rows={4}
                  value={
                    <InstanceGroupLabels labels={overrides.instance_groups} />
                  }
                />
              )}
              {launchConfig.ask_scm_branch_on_launch && (
                <Detail
                  label={i18n._(msg`Source Control Branch`)}
                  value={overrides.scm_branch}
                />
              )}
              {launchConfig.ask_limit_on_launch && (
                <Detail label={i18n._(msg`Limit`)} value={overrides.limit} />
              )}
              {Object.prototype.hasOwnProperty.call(overrides, 'verbosity') &&
              launchConfig.ask_verbosity_on_launch ? (
                <Detail
                  label={i18n._(msg`Verbosity`)}
                  value={VERBOSITY(i18n)[overrides.verbosity]}
                />
              ) : null}
              {launchConfig.ask_tags_on_launch && (
                <Detail
                  fullWidth
                  label={i18n._(msg`Job Tags`)}
                  value={
                    <ChipGroup
                      numChips={5}
                      ouiaId="prompt-job-tag-chips"
                      totalChips={
                        overrides.job_tags === undefined ||
                        overrides.job_tags === null ||
                        overrides.job_tags === ''
                          ? 0
                          : overrides.job_tags.split(',').length
                      }
                    >
                      {overrides.job_tags !== undefined &&
                        overrides.job_tags !== null &&
                        overrides.job_tags !== '' &&
                        overrides.job_tags.length > 0 &&
                        overrides.job_tags.split(',').map((jobTag) => (
                          <Chip
                            key={jobTag}
                            isReadOnly
                            ouiaId={`job-tag-${jobTag}-chip`}
                          >
                            {jobTag}
                          </Chip>
                        ))}
                    </ChipGroup>
                  }
                />
              )}
              {launchConfig.ask_skip_tags_on_launch && (
                <Detail
                  fullWidth
                  label={i18n._(msg`Skip Tags`)}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={
                        overrides.skip_tags === undefined ||
                        overrides.skip_tags === null ||
                        overrides.skip_tags === ''
                          ? 0
                          : overrides.skip_tags.split(',').length
                      }
                      ouiaId="prompt-skip-tag-chips"
                    >
                      {overrides.skip_tags !== undefined &&
                        overrides.skip_tags !== null &&
                        overrides.skip_tags !== '' &&
                        overrides.skip_tags.length > 0 &&
                        overrides.skip_tags.split(',').map((skipTag) => (
                          <Chip
                            key={skipTag}
                            isReadOnly
                            ouiaId={`skip-tag-${skipTag}-chip`}
                          >
                            {skipTag}
                          </Chip>
                        ))}
                    </ChipGroup>
                  }
                />
              )}
              {launchConfig.ask_labels_on_launch && (
                <Detail
                  fullWidth
                  label={i18n._(msg`Labels`)}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={overrides.labels.length}
                      ouiaId="prompt-label-chips"
                    >
                      {overrides.labels.map((label) => (
                        <Chip
                          key={label.id}
                          ouiaId={`label-${label.id}-chip`}
                          isReadOnly
                        >
                          {label.name}
                        </Chip>
                      ))}
                    </ChipGroup>
                  }
                  isEmpty={overrides.labels.length === 0}
                />
              )}
              {launchConfig.ask_forks_on_launch && (
                <Detail label={i18n._(msg`Forks`)} value={overrides.forks} />
              )}
              {launchConfig.ask_job_slice_count_on_launch && (
                <Detail
                  label={i18n._(msg`Job Slicing`)}
                  value={overrides.job_slice_count}
                />
              )}
              {launchConfig.ask_timeout_on_launch && (
                <Detail
                  label={i18n._(msg`Timeout`)}
                  value={formatTimeout(overrides?.timeout)}
                />
              )}
              {launchConfig.ask_diff_mode_on_launch && (
                <Detail
                  label={i18n._(msg`Show Changes`)}
                  value={overrides.diff_mode === true ? i18n._(msg`On`) : i18n._(msg`Off`)}
                />
              )}
              {(launchConfig.survey_enabled ||
                launchConfig.ask_variables_on_launch) && (
                <VariablesDetail
                  dataCy="prompt-detail-variables"
                  label={i18n._(msg`Variables`)}
                  rows={4}
                  value={overrides.extra_vars}
                  name="extra_vars"
                />
              )}
            </PromptDetailList>
          </>
        )}
    </>
  );
}

PromptDetail.defaultProps = {
  launchConfig: { defaults: {} },
};

PromptDetail.propTypes = {
  resource: shape({}).isRequired,
  launchConfig: shape({}),
};

export default PromptDetail;
