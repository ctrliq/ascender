import React, { useCallback } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import {
  Chip,
  Button,
  TextList,
  TextListItem,
  TextListVariants,
  TextListItemVariants,
  Label,
} from '@patternfly/react-core';
import { WorkflowJobTemplatesAPI } from 'api';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import ChipGroup from 'components/ChipGroup';
import { VariablesDetail } from 'components/CodeEditor';
import DeleteButton from 'components/DeleteButton';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import ErrorDetail from 'components/ErrorDetail';
import { LaunchButton } from 'components/LaunchButton';
import Sparkline from 'components/Sparkline';
import { toTitleCase } from 'util/strings';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import getHelpText from '../shared/WorkflowJobTemplate.helptext';

function WorkflowJobTemplateDetail({ template }) {
  const {
    id,
    ask_inventory_on_launch,
    name,
    description,
    type,
    extra_vars,
    created,
    modified,
    summary_fields,
    related,
    webhook_credential,
    webhook_key,
    scm_branch: scmBranch,
    limit,
  } = template;
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const urlOrigin = window.location.origin;
  const history = useHistory();

  const renderOptionsField =
    template.allow_simultaneous || template.webhook_service;

  const renderOptions = (
    <TextList component={TextListVariants.ul}>
      {template.allow_simultaneous && (
        <TextListItem component={TextListItemVariants.li}>
          {i18n._(msg`Concurrent Jobs`)}
        </TextListItem>
      )}
      {template.webhook_service && (
        <TextListItem component={TextListItemVariants.li}>
          {i18n._(msg`Webhooks`)}
        </TextListItem>
      )}
    </TextList>
  );

  const {
    request: deleteWorkflowJobTemplate,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await WorkflowJobTemplatesAPI.destroy(id);
      history.push(`/templates`);
    }, [id, history])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  const inventoryValue = (kind, inventoryId) => {
    const inventorykind = kind === 'smart' ? 'smart_inventory' : 'inventory';

    return ask_inventory_on_launch ? (
      <>
        <Link to={`/inventories/${inventorykind}/${inventoryId}/details`}>
          <Label>{summary_fields.inventory.name}</Label>
        </Link>
        <span> {i18n._(msg`(Prompt on launch)`)}</span>
      </>
    ) : (
      <Link to={`/inventories/${inventorykind}/${inventoryId}/details`}>
        <Label>{summary_fields.inventory.name}</Label>
      </Link>
    );
  };

  const canLaunch = summary_fields?.user_capabilities?.start;
  const recentPlaybookJobs = summary_fields.recent_jobs.map((job) => ({
    ...job,
    type: 'workflow_job',
  }));

  const deleteDetailsRequests =
    relatedResourceDeleteRequests.template(template);

  return (
    <CardBody>
      <DetailList gutter="sm">
        <Detail
          label={i18n._(msg`Name`)}
          value={name}
          dataCy="jt-detail-name"
        />
        <Detail label={i18n._(msg`Description`)} value={description} />
        <Detail
          value={<Sparkline jobs={recentPlaybookJobs} />}
          label={i18n._(msg`Activity`)}
          isEmpty={summary_fields.recent_jobs?.length === 0}
        />
        {summary_fields.organization && (
          <Detail
            label={i18n._(msg`Organization`)}
            value={
              <Link
                to={`/organizations/${summary_fields.organization.id}/details`}
              >
                <Label>{summary_fields.organization.name}</Label>
              </Link>
            }
          />
        )}
        {scmBranch && (
          <Detail
            dataCy="source-control-branch"
            label={i18n._(msg`Source Control Branch`)}
            value={scmBranch}
            helpText={helpText.sourceControlBranch}
          />
        )}
        <Detail label={i18n._(msg`Job Type`)} value={toTitleCase(type)} />
        {summary_fields.inventory && (
          <Detail
            label={i18n._(msg`Inventory`)}
            helpText={helpText.inventory}
            value={inventoryValue(
              summary_fields.inventory.kind,
              summary_fields.inventory.id
            )}
          />
        )}
        <Detail
          dataCy="limit"
          label={i18n._(msg`Limit`)}
          value={limit}
          helpText={helpText.limit}
        />
        <Detail
          label={i18n._(msg`Webhook Service`)}
          value={toTitleCase(template.webhook_service)}
          helpText={helpText.webhookService}
        />
        {related.webhook_receiver && (
          <Detail
            label={i18n._(msg`Webhook URL`)}
            helpText={helpText.webhookURL}
            value={`${urlOrigin}${template.related.webhook_receiver}`}
          />
        )}
        <Detail
          label={i18n._(msg`Webhook Key`)}
          value={webhook_key}
          helpText={helpText.webhookKey}
        />
        {webhook_credential && (
          <Detail
            fullWidth
            label={i18n._(msg`Webhook Credentials`)}
            helpText={helpText.webhookCredential}
            value={
              <Link
                to={`/credentials/${summary_fields.webhook_credential.id}/details`}
              >
                <Label>{summary_fields.webhook_credential.name}</Label>
              </Link>
            }
          />
        )}
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={created}
          user={summary_fields.created_by}
        />
        <UserDateDetail
          label={i18n._(msg`Modified`)}
          date={modified}
          user={summary_fields.modified_by}
        />
        {renderOptionsField && (
          <Detail
            fullWidth
            label={i18n._(msg`Enabled Options`)}
            value={renderOptions}
            helpText={helpText.enabledOptions}
          />
        )}
        <Detail
          fullWidth
          label={i18n._(msg`Labels`)}
          helpText={helpText.labels}
          value={
            <ChipGroup
              numChips={3}
              totalChips={summary_fields.labels.results.length}
              ouiaId="workflow-job-template-detail-label-chips"
            >
              {summary_fields.labels.results.map((l) => (
                <Chip key={l.id} ouiaId={`${l.name}-label-chip`} isReadOnly>
                  {l.name}
                </Chip>
              ))}
            </ChipGroup>
          }
          isEmpty={!summary_fields.labels?.results?.length}
        />
        <VariablesDetail
          dataCy="workflow-job-template-detail-extra-vars"
          helpText={helpText.variables}
          label={i18n._(msg`Variables`)}
          value={extra_vars}
          rows={4}
          name="extra_vars"
        />
      </DetailList>
      <CardActionsRow>
        {summary_fields.user_capabilities &&
          summary_fields.user_capabilities.edit && (
            <Button
              ouiaId="workflow-job-template-detail-edit-button"
              component={Link}
              to={`/templates/workflow_job_template/${id}/edit`}
              aria-label={i18n._(msg`Edit`)}
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
        {canLaunch && (
          <LaunchButton resource={template} aria-label={i18n._(msg`Launch`)}>
            {({ handleLaunch, isLaunching }) => (
              <Button
                ouiaId="workflow-job-template-detail-launch-button"
                variant="secondary"
                type="submit"
                onClick={handleLaunch}
                isDisabled={isLaunching}
              >
                {i18n._(msg`Launch`)}
              </Button>
            )}
          </LaunchButton>
        )}
        {summary_fields.user_capabilities &&
          summary_fields.user_capabilities.delete && (
            <DeleteButton
              name={name}
              modalTitle={i18n._(msg`Delete Workflow Job Template`)}
              onConfirm={deleteWorkflowJobTemplate}
              isDisabled={isLoading}
              deleteDetailsRequests={deleteDetailsRequests}
              deleteMessage={i18n._(
                msg`This workflow job template is currently being used by other resources. Are you sure you want to delete it?`
              )}
            >
              {i18n._(msg`Delete`)}
            </DeleteButton>
          )}
      </CardActionsRow>
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to delete workflow job template.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}
export { WorkflowJobTemplateDetail as _WorkflowJobTemplateDetail };
export default WorkflowJobTemplateDetail;
