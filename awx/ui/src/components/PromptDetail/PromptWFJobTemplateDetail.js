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
import { toTitleCase } from 'util/strings';
import CredentialChip from '../CredentialChip';
import ChipGroup from '../ChipGroup';
import { Detail } from '../DetailList';
import { VariablesDetail } from '../CodeEditor';
import Sparkline from '../Sparkline';

function PromptWFJobTemplateDetail({ resource }) {
  const { i18n } = useLingui();
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

  let optionsList = '';
  if (allow_simultaneous || webhook_service) {
    optionsList = (
      <TextList component={TextListVariants.ul}>
        {allow_simultaneous && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Concurrent Jobs`)}
          </TextListItem>
        )}
        {webhook_service && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(msg`Webhooks`)}
          </TextListItem>
        )}
      </TextList>
    );
  }

  const inventoryKind =
    summary_fields?.inventory?.kind === 'smart'
      ? 'smart_inventory'
      : 'inventory';

  const recentJobs = summary_fields?.recent_jobs?.map((job) => ({
    ...job,
    type: 'job',
  }));

  return (
    <>
      <Detail
        label={i18n._(msg`Activity`)}
        value={<Sparkline jobs={recentJobs} />}
        isEmpty={summary_fields?.recent_jobs?.length === 0}
      />
      {summary_fields?.organization && (
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
      )}
      {summary_fields?.inventory && (
        <Detail
          label={i18n._(msg`Inventory`)}
          value={
            <Link
              to={`/${inventoryKind}/${summary_fields.inventory?.id}/details`}
            >
              {summary_fields.inventory?.name}
            </Link>
          }
        />
      )}
      <Detail label={i18n._(msg`Source Control Branch`)} value={scm_branch} />
      <Detail label={i18n._(msg`Limit`)} value={limit} />
      <Detail
        label={i18n._(msg`Webhook Service`)}
        value={toTitleCase(webhook_service)}
      />
      <Detail label={i18n._(msg`Webhook Key`)} value={webhook_key} />
      {related?.webhook_receiver && (
        <Detail
          label={i18n._(msg`Webhook URL`)}
          value={`${window.location.origin}${related.webhook_receiver}`}
        />
      )}
      {optionsList && (
        <Detail label={i18n._(msg`Enabled Options`)} value={optionsList} />
      )}
      {summary_fields?.webhook_credential && (
        <Detail
          fullWidth
          label={i18n._(msg`Webhook Credential`)}
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
          label={i18n._(msg`Labels`)}
          value={
            <ChipGroup
              numChips={5}
              totalChips={summary_fields.labels.results.length}
              ouiaId="prompt-wf-jt-label-chips"
            >
              {summary_fields.labels.results.map((label) => (
                <Chip key={label.id} isReadOnly>
                  {label.name}
                </Chip>
              ))}
            </ChipGroup>
          }
          isEmpty={summary_fields?.labels?.results?.length === 0}
        />
      )}
      {extra_vars && (
        <VariablesDetail
          label={i18n._(msg`Variables`)}
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
