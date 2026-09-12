import type { InventorySource, SummaryFieldRef } from 'types/api';
import React from 'react';
import { Plural, useLingui } from '@lingui/react/macro';
import { Content, ContentVariants } from '@patternfly/react-core';
import { Link } from 'react-router';

import { Detail, DeletedDetail } from '../DetailList';
import { VariablesDetail } from '../CodeEditor';
import CredentialChip from '../CredentialChip';
import ExecutionEnvironmentDetail from '../ExecutionEnvironmentDetail';
import { getVerbosityLabel } from '../VerbositySelectField';

export interface PromptInventorySourceDetailProps {
  resource: InventorySource;
}

function PromptInventorySourceDetail({
  resource,
}: PromptInventorySourceDetailProps) {
  const {
    overwrite,
    overwrite_vars,
    source,
    source_vars,
    source_path,
    summary_fields,
    update_cache_timeout,
    update_on_launch,
    verbosity,
  } = resource;
  const { t, i18n } = useLingui();
  let optionsList: React.ReactNode = '';
  if (overwrite || overwrite_vars || update_on_launch) {
    optionsList = (
      <Content component={ContentVariants.ul}>
        {overwrite && (
          <Content component={ContentVariants.li}>
            {t`Overwrite local groups and hosts from remote inventory source`}
          </Content>
        )}
        {overwrite_vars && (
          <Content component={ContentVariants.li}>
            {t`Overwrite local variables from remote inventory source`}
          </Content>
        )}
        {update_on_launch && (
          <Content component={ContentVariants.li}>
            {t`Update on launch`}
          </Content>
        )}
      </Content>
    );
  }

  return (
    <>
      {summary_fields?.organization ? (
        <Detail
          label={t`Organization`}
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
      {summary_fields?.inventory && (
        <Detail
          label={t`Inventory`}
          value={
            <Link to={`/inventories/${summary_fields.inventory?.id}/details`}>
              {summary_fields?.inventory?.name}
            </Link>
          }
        />
      )}
      <Detail label={t`Source`} value={source} />
      {summary_fields?.source_project && (
        <Detail
          label={t`Project`}
          value={
            <Link to={`/projects/${summary_fields.source_project?.id}/details`}>
              {summary_fields.source_project?.name}
            </Link>
          }
        />
      )}
      <ExecutionEnvironmentDetail
        executionEnvironment={summary_fields?.execution_environment}
      />
      <Detail label={t`Inventory File`} value={source_path} />
      <Detail label={t`Verbosity`} value={getVerbosityLabel(verbosity, i18n)} />
      <Detail
        label={t`Cache Timeout`}
        value={
          <Plural
            value={update_cache_timeout}
            one="# second"
            other="# seconds"
          />
        }
      />
      <Detail
        fullWidth
        label={t`Credential`}
        value={summary_fields?.credentials?.map((cred: SummaryFieldRef) => (
          <CredentialChip key={cred?.id} credential={cred} isReadOnly />
        ))}
        isEmpty={summary_fields?.credentials?.length === 0}
      />
      {optionsList && (
        <Detail fullWidth label={t`Enabled Options`} value={optionsList} />
      )}
      {source_vars && (
        <VariablesDetail
          dataCy="prompt-inventory-source-detail-source-variables"
          label={t`Source Variables`}
          rows={4}
          value={source_vars}
          name="source_vars"
        />
      )}
    </>
  );
}

export default PromptInventorySourceDetail;
