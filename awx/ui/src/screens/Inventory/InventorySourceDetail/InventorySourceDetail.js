import React, { useCallback, useEffect, useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import {
  Button,
  TextList,
  TextListItem,
  TextListVariants,
  TextListItemVariants,
  Tooltip,
} from '@patternfly/react-core';
import AlertModal from 'components/AlertModal';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import CredentialChip from 'components/CredentialChip';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import JobCancelButton from 'components/JobCancelButton';
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
import { VERBOSITY } from 'components/VerbositySelectField';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import InventorySourceSyncButton from '../shared/InventorySourceSyncButton';
import useWsInventorySourcesDetails from '../shared/useWsInventorySourcesDetails';
import getHelpText from '../shared/Inventory.helptext';

function InventorySourceDetail({ inventorySource }) {
  const { i18n } = useLingui();
  const [isI18nLoading, setIsI18nLoading] = useState(true);
  const [deletionError, setDeletionError] = useState(false);
  const history = useHistory();
  const isMounted = useIsMounted();

  const {
    result: sourceChoices,
    error,
    isLoading,
    request: fetchSourceChoices,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InventorySourcesAPI.readOptions();
      return Object.assign(
        ...data.actions.GET.source.choices.map(([key, val]) => ({ [key]: val }))
      );
    }, [])
  );

  const {
    created,
    custom_virtualenv,
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

  useEffect(() => {
    if (i18n) {
      setIsI18nLoading(false);
    }
  }, [i18n]);

  useEffect(() => {
    fetchSourceChoices();
  }, [fetchSourceChoices]);

  const helpText = getHelpText(i18n);
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

  const handleDelete = async () => {
    try {
      await Promise.all([
        InventorySourcesAPI.destroyHosts(id),
        InventorySourcesAPI.destroyGroups(id),
        InventorySourcesAPI.destroy(id),
      ]);
      history.push(`/inventories/inventory/${inventory.id}/sources`);
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

  let optionsList = '';
  if (overwrite || overwrite_vars || update_on_launch) {
    optionsList = (
      <TextList component={TextListVariants.ul}>
        {overwrite && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(
              t`Overwrite local groups and hosts from remote inventory source`
            )}
            <Popover content={helpText.subFormOptions.overwrite} />
          </TextListItem>
        )}
        {overwrite_vars && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(
              t`Overwrite local variables from remote inventory source`
            )}
            <Popover content={helpText.subFormOptions.overwriteVariables} />
          </TextListItem>
        )}
        {update_on_launch && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(t`Update on launch`)}
            <Popover
              content={helpText.subFormOptions.updateOnLaunch({
                value: source_project,
              })}
            />
          </TextListItem>
        )}
      </TextList>
    );
  }

  if (isLoading) {
    return <ContentLoading />;
  }

  if (error) {
    return <ContentError error={error} />;
  }

  const generateLastJobTooltip = (job) => (
    <>
      <div>{i18n._(t`MOST RECENT SYNC`)}</div>
      <div>
        {i18n._(t`JOB ID:`)} {job.id}
      </div>
      <div>
        {i18n._(t`STATUS:`)} {job.status.toUpperCase()}
      </div>
      {job.finished && (
        <div>
          {i18n._(t`FINISHED:`)} {formatDateString(job.finished)}
        </div>
      )}
    </>
  );

  let job = null;

  if (summary_fields?.current_job) {
    job = summary_fields.current_job;
  } else if (summary_fields?.last_job) {
    job = summary_fields.last_job;
  }

  const docsBaseUrl = getDocsBaseUrl();

  return (
    <CardBody>
      <DetailList gutter="sm">
        <Detail label={i18n._(t`Name`)} value={name} />
        <Detail
          label={i18n._(t`Last Job Status`)}
          value={
            job && (
              <Tooltip
                position="top"
                content={generateLastJobTooltip(job)}
                key={job.id}
              >
                <Link to={`/jobs/inventory/${job.id}`}>
                  <StatusLabel status={job.status} />
                </Link>
              </Tooltip>
            )
          }
        />
        <Detail label={i18n._(t`Description`)} value={description} />
        <Detail label={i18n._(t`Source`)} value={sourceChoices[source]} />
        {organization && (
          <Detail
            label={i18n._(t`Organization`)}
            value={
              <Link to={`/organizations/${organization.id}/details`}>
                {organization.name}
              </Link>
            }
          />
        )}
        <ExecutionEnvironmentDetail
          virtualEnvironment={custom_virtualenv}
          executionEnvironment={execution_environment}
        />
        {source_project && (
          <Detail
            label={i18n._(t`Project`)}
            value={
              <Link to={`/projects/${source_project.id}/details`}>
                {source_project.name}
              </Link>
            }
          />
        )}
        {source === 'scm' ? (
          <Detail
            label={i18n._(t`Inventory file`)}
            helpText={helpText.sourcePath}
            value={
              source_path === '' ? i18n._(t`/ (project root)`) : source_path
            }
          />
        ) : null}
        <Detail
          label={i18n._(t`Verbosity`)}
          helpText={helpText.subFormVerbosityFields}
          value={VERBOSITY(i18n)[verbosity]}
        />
        <Detail
          label={i18n._(t`Source Control Branch`)}
          helpText={helpText.sourceControlBranch}
          value={scm_branch}
        />
        <Detail
          label={i18n._(t`Cache timeout`)}
          value={`${update_cache_timeout} ${i18n._(t`seconds`)}`}
          helpText={helpText.subFormOptions.cachedTimeOut}
        />
        <Detail
          label={i18n._(t`Host Filter`)}
          helpText={helpText.hostFilter}
          value={host_filter}
        />
        <Detail
          label={i18n._(t`Enabled Variable`)}
          helpText={helpText.enabledVariableField}
          value={enabled_var}
        />
        <Detail
          label={i18n._(t`Enabled Value`)}
          helpText={helpText.enabledValue}
          value={enabled_value}
        />
        <Detail
          fullWidth
          label={i18n._(t`Credential`)}
          value={credentials?.map((cred) => (
            <CredentialChip key={cred?.id} credential={cred} isReadOnly />
          ))}
          isEmpty={credentials?.length === 0}
        />
        {optionsList && (
          <Detail
            fullWidth
            label={i18n._(t`Enabled Options`)}
            value={optionsList}
          />
        )}
        {source_vars && (
          <VariablesDetail
            label={i18n._(t`Source variables`)}
            rows={4}
            value={source_vars}
            helpText={helpText.sourceVars(docsBaseUrl, source)}
            name="source_vars"
            dataCy="inventory-source-detail-variables"
          />
        )}
        <UserDateDetail
          date={created}
          label={i18n._(t`Created`)}
          user={created_by}
        />
        <UserDateDetail
          date={modified}
          label={i18n._(t`Last modified`)}
          user={modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {user_capabilities?.edit && (
          <Button
            ouiaId="inventory-source-detail-edit-button"
            component={Link}
            aria-label={i18n._(t`edit`)}
            to={`/inventories/inventory/${inventory.id}/sources/${id}/edit`}
          >
            {i18n._(t`Edit`)}
          </Button>
        )}
        {user_capabilities?.start &&
          (['new', 'running', 'pending', 'waiting'].includes(job?.status) ? (
            <JobCancelButton
              job={{ id: job.id, type: 'inventory_update' }}
              errorTitle={i18n._(t`Inventory Source Sync Error`)}
              title={i18n._(t`Cancel Inventory Source Sync`)}
              errorMessage={i18n._(t`Failed to cancel Inventory Source Sync`)}
              buttonText={i18n._(t`Cancel Sync`)}
            />
          ) : (
            <InventorySourceSyncButton source={inventorySource} icon={false} />
          ))}
        {user_capabilities?.delete && (
          <DeleteButton
            name={name}
            modalTitle={i18n._(t`Delete inventory source`)}
            onConfirm={handleDelete}
            deleteDetailsRequests={deleteDetailsRequests}
            deleteMessage={i18n._(
              t`This inventory source is currently being used by other resources that rely on it. Are you sure you want to delete it?`
            )}
            isDisabled={job?.status === 'running'}
          >
            {i18n._(t`Delete`)}
          </DeleteButton>
        )}
      </CardActionsRow>
      {deletionError && (
        <AlertModal
          variant="error"
          title={i18n._(t`Error!`)}
          isOpen={deletionError}
          onClose={() => setDeletionError(false)}
        >
          {i18n._(t`Failed to delete inventory source ${name}.`)}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </CardBody>
  );
}
export default InventorySourceDetail;
