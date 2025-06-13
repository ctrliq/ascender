import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Link } from 'react-router-dom';
import {
  Chip,
  TextList,
  TextListItem,
  TextListVariants,
  TextListItemVariants,
} from '@patternfly/react-core';
import { Detail, DeletedDetail } from '../DetailList';
import { VariablesDetail } from '../CodeEditor';
import CredentialChip from '../CredentialChip';
import ChipGroup from '../ChipGroup';
import ExecutionEnvironmentDetail from '../ExecutionEnvironmentDetail';
import { VERBOSITY } from '../VerbositySelectField';

function PromptInventorySourceDetail({ resource }) {
  const {
    custom_virtualenv,
    group_by,
    instance_filters,
    overwrite,
    overwrite_vars,
    source,
    source_regions,
    source_vars,
    source_path,
    summary_fields,
    update_cache_timeout,
    update_on_launch,
    verbosity,
  } = resource;
  const { i18n } = useLingui();
  let optionsList = '';
  if (overwrite || overwrite_vars || update_on_launch) {
    optionsList = (
      <TextList component={TextListVariants.ul}>
        {overwrite && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Overwrite local groups and hosts from remote inventory source`)}
          </TextListItem>
        )}
        {overwrite_vars && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Overwrite local variables from remote inventory source`)}
          </TextListItem>
        )}
        {update_on_launch && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Update on launch`)}
          </TextListItem>
        )}
      </TextList>
    );
  }

  return (
    <>
      {summary_fields?.organization ? (
        <Detail
          label={i18n._(msg`Organization`)}
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
      {summary_fields?.inventory && (
        <Detail
          label={i18n._(msg`Inventory`)}
          value={
            <Link to={`/inventories/${summary_fields.inventory?.id}/details`}>
              {summary_fields?.inventory?.name}
            </Link>
          }
        />
      )}
      <Detail label={i18n._(msg`Source`)} value={source} />
      {summary_fields?.source_project && (
        <Detail
          label={i18n._(msg`Project`)}
          value={
            <Link to={`/projects/${summary_fields.source_project?.id}/details`}>
              {summary_fields.source_project?.name}
            </Link>
          }
        />
      )}
      <ExecutionEnvironmentDetail
        virtualEnvironment={custom_virtualenv}
        executionEnvironment={summary_fields?.execution_environment}
      />
      <Detail label={i18n._(msg`Inventory File`)} value={source_path} />
      <Detail label={i18n._(msg`Verbosity`)} value={VERBOSITY(i18n)[verbosity]} />
      <Detail
        label={i18n._(msg`Cache Timeout`)}
        value={`${update_cache_timeout} ${i18n._(msg`Seconds`)}`}
      />
      <Detail
        fullWidth
        label={i18n._(msg`Credential`)}
        value={summary_fields?.credentials?.map((cred) => (
          <CredentialChip key={cred?.id} credential={cred} isReadOnly />
        ))}
        isEmpty={summary_fields?.credentials?.length === 0}
      />
      {source_regions && (
        <Detail
          fullWidth
          label={i18n._(msg`Regions`)}
          value={
            <ChipGroup
              numChips={5}
              totalChips={source_regions.split(',').length}
              ouiaId="prompt-region-chips"
            >
              {source_regions.split(',').map((region) => (
                <Chip key={region} isReadOnly>
                  {region}
                </Chip>
              ))}
            </ChipGroup>
          }
        />
      )}
      {instance_filters && (
        <Detail
          fullWidth
          label={i18n._(msg`Instance Filters`)}
          value={
            <ChipGroup
              numChips={5}
              totalChips={instance_filters.split(',').length}
              ouiaId="prompt-instance-filter-chips"
            >
              {instance_filters.split(',').map((filter) => (
                <Chip key={filter} isReadOnly>
                  {filter}
                </Chip>
              ))}
            </ChipGroup>
          }
        />
      )}
      {group_by && (
        <Detail
          fullWidth
          label={i18n._(msg`Only Group By`)}
          value={
            <ChipGroup
              numChips={5}
              totalChips={group_by.split(',').length}
              ouiaId="prompt-only-group-by-chips"
            >
              {group_by.split(',').map((group) => (
                <Chip key={group} isReadOnly>
                  {group}
                </Chip>
              ))}
            </ChipGroup>
          }
        />
      )}
      {optionsList && (
        <Detail fullWidth label={i18n._(msg`Enabled Options`)} value={optionsList} />
      )}
      {source_vars && (
        <VariablesDetail
          dataCy="prompt-inventory-source-detail-source-variables"
          label={i18n._(msg`Source Variables`)}
          rows={4}
          value={source_vars}
          name="source_vars"
        />
      )}
    </>
  );
}

export default PromptInventorySourceDetail;
