import type { InstanceGroup } from 'types/api';
import React, { useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';

import { Link, useNavigate } from 'react-router';
import { Button } from '@patternfly/react-core';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import ErrorDetail from 'components/ErrorDetail';
import DeleteButton from 'components/DeleteButton';
import { Detail, DetailList, UserDateDetail } from 'components/DetailList';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { InstanceGroupsAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import './InstanceGroupDetails.css';

export interface InstanceGroupDetailsProps {
  instanceGroup: InstanceGroup;
  [key: string]: unknown;
}

function InstanceGroupDetails({ instanceGroup }: InstanceGroupDetailsProps) {
  const { t } = useLingui();
  const { id, name } = instanceGroup;
  const navigate = useNavigate();

  const {
    request: deleteInstanceGroup,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await InstanceGroupsAPI.destroy(id);
      navigate(`/instance_groups`);
    }, [id, navigate])
  );

  const { error, dismissError } = useDismissableError(deleteError);
  const deleteDetailsRequests =
    relatedResourceDeleteRequests.instanceGroup(instanceGroup);
  return (
    <CardBody>
      <DetailList>
        <Detail
          label={t`Name`}
          value={instanceGroup.name}
          dataCy="instance-group-detail-name"
        />
        <Detail
          label={t`Type`}
          value={
            instanceGroup.is_container_group
              ? t`Container Group`
              : t`Instance Group`
          }
          dataCy="instance-group-type"
        />
        {/* The figures are plain values, as every other detail's are: a
            grey badge made a count read as a tag, and the percentages here
            are written the way the rest of the UI writes them. */}
        <Detail
          label={t`Policy Instance Minimum`}
          dataCy="instance-group-policy-instance-minimum"
          helpText={t`Minimum number of instances that will be automatically
          assigned to this group when new instances come online.`}
          value={instanceGroup.policy_instance_minimum}
        />
        <Detail
          label={t`Policy Instance Percentage`}
          helpText={t`Minimum percentage of all instances that will be automatically
          assigned to this group when new instances come online.`}
          dataCy="instance-group-policy-instance-percentage"
          value={`${instanceGroup.policy_instance_percentage}%`}
        />
        <Detail
          label={t`Max Concurrent Jobs`}
          dataCy="instance-group-max-concurrent-jobs"
          helpText={t`Maximum number of jobs to run concurrently on this group.
          Zero means no limit will be enforced.`}
          value={instanceGroup.max_concurrent_jobs}
        />
        <Detail
          label={t`Max Forks`}
          dataCy="instance-group-max-forks"
          helpText={t`Maximum number of forks to allow across all jobs running concurrently on this group.
          Zero means no limit will be enforced.`}
          value={instanceGroup.max_forks}
        />
        {instanceGroup.capacity ? (
          <Detail
            label={t`Used Capacity`}
            value={`${Math.round(
              100 - Number(instanceGroup.percent_capacity_remaining ?? 0)
            )}%`}
            dataCy="instance-group-used-capacity"
          />
        ) : (
          <Detail
            label={t`Used Capacity`}
            value={
              <span className="ascender-instance-group-details__unavailable">{t`Unavailable`}</span>
            }
            dataCy="instance-group-used-capacity"
          />
        )}
        <UserDateDetail
          label={t`Created`}
          date={instanceGroup.created}
          user={instanceGroup.summary_fields.created_by}
        />
        <UserDateDetail
          label={t`Last Modified`}
          date={instanceGroup.modified}
          user={instanceGroup.summary_fields.modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {instanceGroup.summary_fields.user_capabilities &&
          instanceGroup.summary_fields.user_capabilities.edit && (
            <Button
              ouiaId="instance-group-detail-edit-button"
              aria-label={t`Edit`}
              component={Link}
              to={`/instance_groups/${id}/edit`}
            >
              {t`Edit`}
            </Button>
          )}
        {instanceGroup.summary_fields.user_capabilities &&
          instanceGroup.summary_fields.user_capabilities.delete && (
            <DeleteButton
              ouiaId="instance-group-detail-delete-button"
              name={name}
              modalTitle={t`Delete Instance Group`}
              onConfirm={deleteInstanceGroup}
              isDisabled={isLoading}
              deleteDetailsRequests={deleteDetailsRequests}
              deleteMessage={t`This instance group is currently being used by other resources. Are you sure you want to delete it?`}
            >
              {t`Delete`}
            </DeleteButton>
          )}
      </CardActionsRow>
      {Boolean(error) && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={t`Error!`}
          variant="error"
        >
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default InstanceGroupDetails;
