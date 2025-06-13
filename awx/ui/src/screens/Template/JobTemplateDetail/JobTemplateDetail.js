import React, { useCallback, useEffect } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';
import {
  Button,
  Chip,
  TextList,
  TextListItem,
  TextListItemVariants,
  TextListVariants,
  Label,
} from '@patternfly/react-core';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import ChipGroup from 'components/ChipGroup';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import CredentialChip from 'components/CredentialChip';
import {
  Detail,
  DetailList,
  DeletedDetail,
  UserDateDetail,
} from 'components/DetailList';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import { LaunchButton } from 'components/LaunchButton';
import { VariablesDetail } from 'components/CodeEditor';
import { VERBOSITY } from 'components/VerbositySelectField';
import { JobTemplatesAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import useBrandName from 'hooks/useBrandName';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import InstanceGroupLabels from 'components/InstanceGroupLabels';
import getHelpText from '../shared/JobTemplate.helptext';

function JobTemplateDetail({ template }) {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const {
    ask_inventory_on_launch,
    allow_simultaneous,
    become_enabled,
    created,
    description,
    diff_mode,
    extra_vars,
    forks,
    host_config_key,
    job_slice_count,
    job_tags,
    job_type,
    name,
    limit,
    modified,
    playbook,
    skip_tags,
    timeout,
    summary_fields,
    use_fact_cache,
    url,
    verbosity,
    webhook_service,
    related: { webhook_receiver },
    webhook_key,
    prevent_instance_group_fallback,
    custom_virtualenv,
  } = template;
  const { id: templateId } = useParams();
  const history = useHistory();
  const brandName = useBrandName();
  const {
    isLoading: isLoadingInstanceGroups,
    request: fetchInstanceGroups,
    error: instanceGroupsError,
    result: { instanceGroups },
  } = useRequest(
    useCallback(async () => {
      const {
        data: { results },
      } = await JobTemplatesAPI.readInstanceGroups(templateId);
      return { instanceGroups: results };
    }, [templateId]),
    { instanceGroups: [] }
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups]);

  const {
    request: deleteJobTemplate,
    isLoading: isDeleteLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await JobTemplatesAPI.destroy(templateId);
      history.push(`/templates`);
    }, [templateId, history])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  const deleteDetailsRequests =
    relatedResourceDeleteRequests.template(template);
  const canLaunch =
    summary_fields.user_capabilities && summary_fields.user_capabilities.start;
  const generateCallBackUrl = `${window.location.origin + url}callback/`;
  const renderOptionsField =
    become_enabled ||
    host_config_key ||
    allow_simultaneous ||
    use_fact_cache ||
    webhook_service ||
    prevent_instance_group_fallback;

  const renderOptions = (
    <TextList component={TextListVariants.ul}>
      {become_enabled && (
        <TextListItem component={TextListItemVariants.li}>
          {i18n._(msg`Privilege Escalation`)}
        </TextListItem>
      )}
      {host_config_key && (
        <TextListItem component={TextListItemVariants.li}>
          {i18n._(msg`Provisioning Callbacks`)}
        </TextListItem>
      )}
      {allow_simultaneous && (
        <TextListItem component={TextListItemVariants.li}>
          {i18n._(msg`Concurrent Jobs`)}
        </TextListItem>
      )}
      {use_fact_cache && (
        <TextListItem component={TextListItemVariants.li}>
          {i18n._(msg`Fact Storage`)}
        </TextListItem>
      )}
      {webhook_service && (
        <TextListItem component={TextListItemVariants.li}>
          {i18n._(msg`Webhooks`)}
        </TextListItem>
      )}
      {prevent_instance_group_fallback && (
        <TextListItem component={TextListItemVariants.li}>
          {i18n._(msg`Prevent Instance Group Fallback`)}
        </TextListItem>
      )}
    </TextList>
  );

  const inventoryValue = (kind, id) => {
    const inventorykind = kind === 'smart' ? 'smart_inventory' : 'inventory';

    return ask_inventory_on_launch ? (
      <>
        <Link to={`/inventories/${inventorykind}/${id}/details`}>
          {summary_fields.inventory.name}
        </Link>
        <span> {i18n._(msg`(Prompt on launch)`)} </span>
      </>
    ) : (
      <Link to={`/inventories/${inventorykind}/${id}/details`}>
        {summary_fields.inventory.name}
      </Link>
    );
  };

  if (instanceGroupsError) {
    return <ContentError error={instanceGroupsError} />;
  }

  if (isLoadingInstanceGroups || isDeleteLoading) {
    return <ContentLoading />;
  }
  return (
    <CardBody>
      <DetailList gutter="sm">
        <Detail label={i18n._(msg`Name`)} value={name} dataCy="jt-detail-name" />
        <Detail
          label={i18n._(msg`Description`)}
          value={description}
          dataCy="jt-detail-description"
        />
        <Detail
          label={i18n._(msg`Job Type`)}
          value={job_type}
          dataCy="jt-detail-job-type"
          helpText={helpText.jobType}
        />
        {summary_fields.organization ? (
          <Detail
            label={i18n._(msg`Organization`)}
            dataCy="jt-detail-organization"
            value={
              <Link
                to={`/organizations/${summary_fields.organization.id}/details`}
              >
                {summary_fields.organization.name}
              </Link>
            }
          />
        ) : (
          <DeletedDetail label={i18n._(msg`Organization`)} />
        )}
        {summary_fields.inventory ? (
          <Detail
            label={i18n._(msg`Inventory`)}
            dataCy="jt-detail-inventory"
            value={inventoryValue(
              summary_fields.inventory.kind,
              summary_fields.inventory.id
            )}
            helpText={helpText.inventory}
          />
        ) : (
          !ask_inventory_on_launch && (
            <DeletedDetail label={i18n._(msg`Inventory`)} dataCy="jt-detail-inventory" />
          )
        )}
        {summary_fields.project ? (
          <Detail
            label={i18n._(msg`Project`)}
            dataCy="jt-detail-project"
            value={
              <Link to={`/projects/${summary_fields.project.id}/details`}>
                {summary_fields.project.name}
              </Link>
            }
            helpText={helpText.project}
          />
        ) : (
          <DeletedDetail label={i18n._(msg`Project`)} />
        )}
        <ExecutionEnvironmentDetail
          virtualEnvironment={custom_virtualenv}
          executionEnvironment={summary_fields?.resolved_environment}
          helpText={helpText.executionEnvironmentDetail}
          dataCy="jt-detail-execution-environment"
        />
        <Detail
          label={i18n._(msg`Source Control Branch`)}
          value={template.scm_branch}
          dataCy="jt-detail-scm-branch"
        />
        <Detail
          label={i18n._(msg`Playbook`)}
          value={playbook}
          dataCy="jt-detail-playbook"
          helpText={helpText.playbook}
        />
        <Detail
          label={i18n._(msg`Forks`)}
          value={forks || '0'}
          dataCy="jt-detail-forks"
          helpText={helpText.forks}
        />
        <Detail
          label={i18n._(msg`Limit`)}
          value={limit}
          dataCy="jt-detail-limit"
          helpText={helpText.limit}
        />
        <Detail
          label={i18n._(msg`Verbosity`)}
          value={VERBOSITY(i18n)[verbosity]}
          dataCy="jt-detail-verbosity"
          helpText={helpText.verbosity}
        />
        <Detail
          label={i18n._(msg`Timeout`)}
          value={timeout || '0'}
          dataCy="jt-detail-timeout"
          helpText={helpText.timeout}
        />
        <Detail
          label={i18n._(msg`Show Changes`)}
          value={diff_mode ? i18n._(msg`On`) : i18n._(msg`Off`)}
          dataCy="jt-detail-show-changes"
          helpText={helpText.showChanges}
        />
        <Detail
          label={i18n._(msg`Job Slicing`)}
          value={job_slice_count}
          dataCy="jt-detail-job-slice-count"
          helpText={helpText.jobSlicing}
        />
        {host_config_key && (
          <>
            <Detail
              label={i18n._(msg`Host Config Key`)}
              value={host_config_key}
              dataCy="jt-detail-host-config-key"
            />
            <Detail
              label={i18n._(msg`Provisioning Callback URL`)}
              value={generateCallBackUrl}
              dataCy="jt-detail-provisioning-callback-url"
              helpText={helpText.provisioningCallbacks(brandName)}
            />
          </>
        )}
        {webhook_service && (
          <Detail
            label={i18n._(msg`Webhook Service`)}
            value={webhook_service === 'github' ? i18n._(msg`GitHub`) : i18n._(msg`GitLab`)}
            dataCy="jt-detail-webhook-service"
            helpText={helpText.webhookService}
          />
        )}
        {webhook_receiver && (
          <Detail
            label={i18n._(msg`Webhook URL`)}
            value={`${document.location.origin}${webhook_receiver}`}
            dataCy="jt-detail-webhook-url"
            helpText={helpText.webhookURL}
          />
        )}
        <Detail
          label={i18n._(msg`Webhook Key`)}
          value={webhook_key}
          dataCy="jt-detail-webhook-key"
          helpText={helpText.webhookKey}
        />
        {summary_fields.webhook_credential && (
          <Detail
            label={i18n._(msg`Webhook Credential`)}
            dataCy="jt-detail-webhook-credential"
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
        {prevent_instance_group_fallback && (
          <Detail
            label={i18n._(msg`Prevent Instance Group Fallback`)}
            dataCy="jt-detail-prevent-instnace-group-fallback"
            helpText={helpText.preventInstanceGroupFallback}
          />
        )}
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={created}
          user={summary_fields.created_by}
        />
        <UserDateDetail
          label={i18n._(msg`Last Modified`)}
          date={modified}
          user={summary_fields.modified_by}
        />
        {renderOptionsField && (
          <Detail
            fullWidth
            label={i18n._(msg`Enabled Options`)}
            value={renderOptions}
            dataCy="jt-detail-enabled-options"
            helpText={helpText.enabledOptions}
          />
        )}
        {summary_fields.credentials && (
          <Detail
            fullWidth
            label={i18n._(msg`Credentials`)}
            dataCy="jt-detail-credentials"
            helpText={helpText.credentials}
            value={
              <ChipGroup
                numChips={5}
                totalChips={summary_fields.credentials.length}
                ouiaId="jt-detail-credential-chips"
              >
                {summary_fields.credentials.map((c) => (
                  <Link to={`/credentials/${c.id}/details`} key={c.id}>
                    <CredentialChip
                      key={c.id}
                      credential={c}
                      ouiaId={`credential-${c.id}-chip`}
                      isReadOnly
                    />
                  </Link>
                ))}
              </ChipGroup>
            }
            isEmpty={summary_fields.credentials.length === 0}
          />
        )}
        {summary_fields.labels && (
          <Detail
            fullWidth
            label={i18n._(msg`Labels`)}
            dataCy="jt-detail-labels"
            helpText={helpText.labels}
            value={
              <ChipGroup
                numChips={5}
                totalChips={summary_fields.labels.results.length}
                ouiaId="label-chips"
              >
                {summary_fields.labels.results.map((l) => (
                  <Chip key={l.id} ouiaId={`label-${l.id}-chip`} isReadOnly>
                    {l.name}
                  </Chip>
                ))}
              </ChipGroup>
            }
            isEmpty={summary_fields.labels.results.length === 0}
          />
        )}
        <Detail
          fullWidth
          label={i18n._(msg`Instance Groups`)}
          dataCy="jt-detail-instance-groups"
          helpText={helpText.instanceGroups}
          value={<InstanceGroupLabels labels={instanceGroups} isLinkable />}
          isEmpty={instanceGroups.length === 0}
        />
        {job_tags && (
          <Detail
            fullWidth
            label={i18n._(msg`Job Tags`)}
            dataCy="jt-detail-job-tags"
            helpText={helpText.jobTags}
            value={
              <ChipGroup
                numChips={5}
                totalChips={job_tags.split(',').length}
                ouiaId="job-tag-chips"
              >
                {job_tags.split(',').map((jobTag) => (
                  <Chip
                    key={jobTag}
                    ouiaId={`job-tag-${jobTag}-chip`}
                    isReadOnly
                  >
                    {jobTag}
                  </Chip>
                ))}
              </ChipGroup>
            }
            isEmpty={job_tags.length === 0}
          />
        )}
        {skip_tags && (
          <Detail
            fullWidth
            label={i18n._(msg`Skip Tags`)}
            dataCy="jt-detail-skip-tags"
            helpText={helpText.skipTags}
            value={
              <ChipGroup
                numChips={5}
                totalChips={skip_tags.split(',').length}
                ouiaId="skip-tag-chips"
              >
                {skip_tags.split(',').map((skipTag) => (
                  <Chip
                    key={skipTag}
                    ouiaId={`skip-tag-${skipTag}-chip`}
                    isReadOnly
                  >
                    {skipTag}
                  </Chip>
                ))}
              </ChipGroup>
            }
            isEmpty={skip_tags.length === 0}
          />
        )}
        <VariablesDetail
          value={extra_vars}
          rows={4}
          label={i18n._(msg`Variables`)}
          dataCy={`jt-detail-${template.id}`}
          name="extra_vars"
          helpText={helpText.variables}
        />
      </DetailList>
      <CardActionsRow>
        {summary_fields.user_capabilities &&
          summary_fields.user_capabilities.edit && (
            <Button
              ouiaId="job-template-detail-edit-button"
              component={Link}
              to={`/templates/job_template/${templateId}/edit`}
              aria-label={i18n._(msg`Edit`)}
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
        {canLaunch && (
          <LaunchButton resource={template} aria-label={i18n._(msg`Launch`)}>
            {({ handleLaunch, isLaunching }) => (
              <Button
                ouiaId="job-template-detail-launch-button"
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
              ouiaId="job-template-detail-delete-button"
              name={name}
              modalTitle={i18n._(msg`Delete Job Template`)}
              onConfirm={deleteJobTemplate}
              isDisabled={isDeleteLoading}
              deleteDetailsRequests={deleteDetailsRequests}
              deleteMessage={i18n._(msg`This job template is currently being used by other resources. Are you sure you want to delete it?`)}
            >
              {i18n._(msg`Delete`)}
            </DeleteButton>
          )}
      </CardActionsRow>
      {/* Update delete modal to show dependencies https://github.com/ansible/awx/issues/5546 */}
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to delete job template.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export { JobTemplateDetail as _JobTemplateDetail };
export default JobTemplateDetail;
