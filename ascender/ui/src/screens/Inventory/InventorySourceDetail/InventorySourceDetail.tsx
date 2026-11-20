import type { InventorySource, SummaryFieldRef, UnifiedJob } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plural, useLingui } from '@lingui/react/macro';
import { Button, Content, ContentVariants } from '@patternfly/react-core';
import AlertModal from 'components/AlertModal';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import CredentialChip from 'components/CredentialChip';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import InstanceGroupLabels from 'components/InstanceGroupLabels';
import JobCancelButton from 'components/JobCancelButton';
import useCanCancelSync from 'hooks/useCanCancelSync';
import { getRunActionLabels, isJobCancelable } from 'util/jobs';
import StatusLabel from 'components/StatusLabel';
import { CardBody, CardActionsRow } from 'components/Card';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';
import useRequest from 'hooks/useRequest';
import { InventorySourcesAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import useIsMounted from 'hooks/useIsMounted';
import { formatDateString } from 'util/dates';
import Popover from 'components/Popover';
import { getVerbosityLabel } from 'components/VerbositySelectField';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import Tooltip from 'components/Tooltip';
import InventorySourceSyncButton from '../shared/InventorySourceSyncButton';
import useWsInventorySourcesDetails from '../shared/useWsInventorySourcesDetails';
import getHelpText from '../shared/Inventory.helptext';
import { getVmwarePlugin } from '../shared/utils';

export interface InventorySourceDetailProps {
  inventorySource: InventorySource;
}

function InventorySourceDetail({
  inventorySource,
}: InventorySourceDetailProps) {
  const { t, i18n } = useLingui();
  const [isI18nLoading, setIsI18nLoading] = useState(true);
  const [deletionError, setDeletionError] = useState<unknown>(false);
  const navigate = useNavigate();
  const isMounted = useIsMounted();

  const {
    result: sourceChoices,
    error,
    isLoading,
    request: fetchSourceChoices,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InventorySourcesAPI.readOptions();
      return Object.fromEntries(
        (data.actions.GET?.source?.choices ?? []).map(([key, val]) => [
          key,
          val,
        ])
      );
    }, [])
  );

  const { result: instanceGroups, request: fetchInstanceGroups } = useRequest(
    useCallback(async () => {
      const { data } = await InventorySourcesAPI.readInstanceGroups(
        inventorySource.id
      );
      return data.results;
    }, [inventorySource.id]),
    []
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups]);

  const {
    created,
    description,
    id,
    modified,
    name,
    overwrite,
    overwrite_vars,
    source,
    source_path,
    source_vars,
    scm_branch,
    update_cache_timeout,
    update_on_launch,
    verbosity,
    enabled_var,
    enabled_value,
    host_filter,
    summary_fields,
  } = useWsInventorySourcesDetails(inventorySource);

  // t is always defined, so this has always run on the first render; it is
  // the render after the catalogue loads that it is waiting for.
  useEffect(() => {
    setIsI18nLoading(false);
  }, [t]);

  useEffect(() => {
    fetchSourceChoices();
  }, [fetchSourceChoices]);

  const helpText = getHelpText();
  const {
    created_by,
    credentials,
    inventory,
    modified_by,
    organization,
    source_project,
    user_capabilities,
    execution_environment,
  } = summary_fields;

  // Read before the loading returns below, since it feeds a hook.
  let job = null;

  if (summary_fields?.current_job) {
    job = summary_fields.current_job;
  } else if (summary_fields?.last_job) {
    job = summary_fields.last_job;
  }
  const canCancelSync = useCanCancelSync(
    'inventory_update',
    job?.id,
    job?.status,
    user_capabilities?.edit
  );

  const handleDelete = async () => {
    try {
      await Promise.all([
        InventorySourcesAPI.destroyHosts(id),
        InventorySourcesAPI.destroyGroups(id),
        InventorySourcesAPI.destroy(id),
      ]);
      navigate(`/inventories/inventory/${inventory?.id}/sources`);
    } catch (err) {
      if (isMounted.current) {
        setDeletionError(err);
      }
    }
  };

  const deleteDetailsRequests = relatedResourceDeleteRequests.inventorySource(
    inventorySource.id
  );

  if (isI18nLoading) {
    return <ContentLoading />;
  }

  let optionsList: React.ReactNode = '';
  if (overwrite || overwrite_vars || update_on_launch) {
    optionsList = (
      <Content component={ContentVariants.ul}>
        {overwrite && (
          <Content component={ContentVariants.li}>
            {t`Overwrite`}
            <Popover content={helpText.subFormOptions.overwrite} />
          </Content>
        )}
        {overwrite_vars && (
          <Content component={ContentVariants.li}>
            {t`Overwrite Variables`}
            <Popover content={helpText.subFormOptions.overwriteVariables} />
          </Content>
        )}
        {update_on_launch && (
          <Content component={ContentVariants.li}>
            {t`Update on Launch`}
            <Popover
              content={helpText.subFormOptions.updateOnLaunch({
                value: source_project,
              })}
            />
          </Content>
        )}
      </Content>
    );
  }

  if (isLoading) {
    return <ContentLoading />;
  }

  if (error) {
    return <ContentError error={error} />;
  }

  const generateLastJobTooltip = (job: UnifiedJob) => (
    <>
      <div>{t`MOST RECENT SYNC`}</div>
      <div>
        {t`JOB ID:`} {job.id}
      </div>
      <div>
        {t`STATUS:`} {job.status.toUpperCase()}
      </div>
      {job.finished && (
        <div>
          {t`FINISHED:`} {formatDateString(job.finished)}
        </div>
      )}
    </>
  );

  const docsBaseUrl = getDocsBaseUrl();

  return (
    <CardBody>
      <DetailList gutter="sm">
        <Detail label={t`Name`} value={name} />
        <Detail
          label={t`Last Job Status`}
          value={
            job && (
              <Tooltip
                position="top"
                content={generateLastJobTooltip(job as UnifiedJob)}
                key={job.id}
              >
                <Link to={`/runs/inventory/${job.id}`}>
                  <StatusLabel status={job.status} />
                </Link>
              </Tooltip>
            )
          }
        />
        <Detail label={t`Description`} value={description} />
        <Detail label={t`Source`} value={sourceChoices?.[source ?? '']} />
        {organization && (
          <Detail
            label={t`Organization`}
            value={
              <Link to={`/organizations/${organization.id}/details`}>
                {organization.name}
              </Link>
            }
          />
        )}
        <ExecutionEnvironmentDetail
          executionEnvironment={execution_environment}
        />
        {instanceGroups && instanceGroups.length > 0 && (
          <Detail
            fullWidth
            label={t`Instance Groups`}
            value={<InstanceGroupLabels labels={instanceGroups} isLinkable />}
          />
        )}
        {source_project && (
          <Detail
            label={t`Project`}
            value={
              <Link to={`/projects/${source_project.id}/details`}>
                {source_project.name}
              </Link>
            }
          />
        )}
        {source === 'scm' ? (
          <Detail
            label={t`Inventory File`}
            helpText={helpText.sourcePath}
            value={source_path === '' ? t`/ (project root)` : source_path}
          />
        ) : null}
        {source === 'vmware' ? (
          <Detail
            label={t`Collection`}
            helpText={helpText.vmwarePlugin}
            value={(getVmwarePlugin(source_vars) as string)
              .split('.', 2)
              .join('.')}
          />
        ) : null}
        <Detail
          label={t`Verbosity`}
          helpText={helpText.subFormVerbosityFields}
          value={getVerbosityLabel(verbosity, i18n)}
        />
        <Detail
          label={t`Source Control Branch/Tag/Commit`}
          helpText={helpText.sourceControlBranch}
          value={scm_branch}
        />
        <Detail
          label={t`Cache Timeout`}
          value={
            <Plural
              value={update_cache_timeout}
              one="# second"
              other="# seconds"
            />
          }
          helpText={helpText.subFormOptions.cachedTimeOut}
        />
        <Detail
          label={t`Host Filter`}
          helpText={helpText.hostFilter}
          value={host_filter}
        />
        <Detail
          label={t`Enabled Variable`}
          helpText={helpText.enabledVariableField}
          value={enabled_var}
        />
        <Detail
          label={t`Enabled Value`}
          helpText={helpText.enabledValue}
          value={enabled_value}
        />
        <Detail
          fullWidth
          label={t`Credential`}
          value={credentials?.map((cred: SummaryFieldRef) => (
            <CredentialChip key={cred?.id} credential={cred} isReadOnly />
          ))}
          isEmpty={credentials?.length === 0}
        />
        {optionsList && (
          <Detail fullWidth label={t`Update Options`} value={optionsList} />
        )}
        {source_vars && (
          <VariablesDetail
            label={t`Source Variables`}
            rows={4}
            value={source_vars}
            helpText={helpText.sourceVars(docsBaseUrl, source ?? '')}
            name="source_vars"
            dataCy="inventory-source-detail-variables"
          />
        )}
        <UserDateDetail date={created} label={t`Created`} user={created_by} />
        <UserDateDetail
          date={modified}
          label={t`Last Modified`}
          user={modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {user_capabilities?.edit && (
          <Button
            ouiaId="inventory-source-detail-edit-button"
            component={Link}
            aria-label={t`Edit`}
            to={`/inventories/inventory/${inventory?.id}/sources/${id}/edit`}
          >
            {t`Edit`}
          </Button>
        )}
        {/* While a sync can still be stopped the place of Sync is taken by
            its Cancel, for whoever the api lets cancel it. */}
        {isJobCancelable(job?.status)
          ? canCancelSync && (
              <JobCancelButton
                job={{ id: job!.id, type: 'inventory_update' }}
                /* The shared wording for this kind of run, the one the runs
                   list and the run's own page use. */
                title={i18n._(getRunActionLabels('inventory_update').cancel)}
              />
            )
          : user_capabilities?.start && (
              <InventorySourceSyncButton
                source={inventorySource}
                icon={false}
              />
            )}
        {user_capabilities?.delete && (
          <DeleteButton
            name={name}
            modalTitle={t`Delete Inventory Source`}
            onConfirm={handleDelete}
            deleteDetailsRequests={deleteDetailsRequests}
            deleteMessage={t`This inventory source is currently being used by other resources that rely on it. Are you sure you want to delete it?`}
            isDisabled={job?.status === 'running'}
          >
            {t`Delete`}
          </DeleteButton>
        )}
      </CardActionsRow>
      {Boolean(deletionError) && (
        <AlertModal
          variant="error"
          title={t`Error!`}
          isOpen={Boolean(deletionError)}
          onClose={() => setDeletionError(false)}
        >
          {t`Failed to delete inventory source ${name}.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </CardBody>
  );
}
export default InventorySourceDetail;
