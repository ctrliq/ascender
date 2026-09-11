import type { RecentJob, Untyped, WorkflowJobTemplate } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { Label, Content, ContentVariants } from '@patternfly/react-core';

import { toTitleCase } from 'util/strings';
import CredentialChip from '../CredentialChip';
import ChipGroup from '../ChipGroup';
import { Detail } from '../DetailList';
import { VariablesDetail } from '../CodeEditor';
import Sparkline from '../Sparkline';

/**
 * The workflow job template a prompt is showing. webhook_key is not a field of
 * its serializer, the same as on the job template prompt above, and renders
 * empty unless a caller has fetched it and attached it.
 */
export type PromptWorkflowJobTemplate = WorkflowJobTemplate & {
  webhook_key?: string;
};

export interface PromptWFJobTemplateDetailProps {
  resource: PromptWorkflowJobTemplate;
  [key: string]: unknown;
}

function PromptWFJobTemplateDetail({
  resource,
}: PromptWFJobTemplateDetailProps) {
  const { t } = useLingui();
  const {
    allow_simultaneous,
    extra_vars,
    limit,
    related,
    scm_branch,
    summary_fields,
    webhook_key,
    webhook_service,
  } = resource;

  let optionsList: React.ReactNode = '';
  if (allow_simultaneous || webhook_service) {
    optionsList = (
      <Content component={ContentVariants.ul}>
        {allow_simultaneous && (
          <Content component={ContentVariants.li}>{t`Concurrent Jobs`}</Content>
        )}
        {webhook_service && (
          <Content component={ContentVariants.li}>{t`Webhooks`}</Content>
        )}
      </Content>
    );
  }

  const inventoryKind =
    summary_fields?.inventory?.kind === 'smart'
      ? 'smart_inventory'
      : 'inventory';

  const recentJobs = summary_fields?.recent_jobs?.map((job: RecentJob) => ({
    ...job,
    type: 'job',
  }));

  return (
    <>
      <Detail
        label={t`Activity`}
        value={<Sparkline jobs={recentJobs} />}
        isEmpty={summary_fields?.recent_jobs?.length === 0}
      />
      {summary_fields?.organization && (
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
      )}
      {summary_fields?.inventory && (
        <Detail
          label={t`Inventory`}
          value={
            <Link
              to={`/${inventoryKind}/${summary_fields.inventory?.id}/details`}
            >
              {summary_fields.inventory?.name}
            </Link>
          }
        />
      )}
      <Detail label={t`Source Control Branch`} value={scm_branch} />
      <Detail label={t`Limit`} value={limit} />
      <Detail label={t`Webhook Service`} value={toTitleCase(webhook_service)} />
      <Detail label={t`Webhook Key`} value={webhook_key} />
      {related?.webhook_receiver && (
        <Detail
          label={t`Webhook URL`}
          value={`${window.location.origin}${related.webhook_receiver}`}
        />
      )}
      {optionsList && <Detail label={t`Enabled Options`} value={optionsList} />}
      {summary_fields?.webhook_credential && (
        <Detail
          fullWidth
          label={t`Webhook Credential`}
          value={
            <CredentialChip
              key={summary_fields.webhook_credential?.id}
              credential={summary_fields.webhook_credential}
              isReadOnly
            />
          }
        />
      )}
      {summary_fields?.labels?.results && (
        <Detail
          fullWidth
          label={t`Labels`}
          value={
            <ChipGroup
              numChips={5}
              totalChips={summary_fields.labels.results.length}
              ouiaId="prompt-wf-jt-label-chips"
            >
              {summary_fields.labels.results.map((label: Untyped) => (
                <Label variant="outline" key={label.id}>
                  {label.name}
                </Label>
              ))}
            </ChipGroup>
          }
          isEmpty={summary_fields?.labels?.results?.length === 0}
        />
      )}
      {extra_vars && (
        <VariablesDetail
          label={t`Variables`}
          rows={4}
          value={extra_vars}
          name="extra_vars"
          dataCy="prompt-wf-jt-detail-variables"
        />
      )}
    </>
  );
}

export default PromptWFJobTemplateDetail;
