import React, { useCallback } from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { Link, useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '@patternfly/react-core';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import ErrorDetail from 'components/ErrorDetail';
import DeleteButton from 'components/DeleteButton';
import {
  Detail,
  DetailList,
  UserDateDetail,
  DetailBadge,
} from 'components/DetailList';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { InstanceGroupsAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';

const Unavailable = styled.span`
  color: var(--pf-global--danger-color--200);
`;

function InstanceGroupDetails({ instanceGroup }) {
  const { i18n } = useLingui();
  const { id, name } = instanceGroup;
  const history = useHistory();

  const {
    request: deleteInstanceGroup,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await InstanceGroupsAPI.destroy(id);
      history.push(`/instance_groups`);
    }, [id, history])
  );

  const { error, dismissError } = useDismissableError(deleteError);
  const deleteDetailsRequests =
    relatedResourceDeleteRequests.instanceGroup(instanceGroup);
  return (
    <CardBody>
      <DetailList>
        <Detail
          label={i18n._(msg`Name`)}
          value={instanceGroup.name}
          dataCy="instance-group-detail-name"
        />
        <Detail
          label={i18n._(msg`Type`)}
          value={
            instanceGroup.is_container_group
              ? i18n._(msg`Container group`)
              : i18n._(msg`Instance group`)
          }
          dataCy="instance-group-type"
        />
        <DetailBadge
          label={i18n._(msg`Policy instance minimum`)}
          dataCy="instance-group-policy-instance-minimum"
          helpText={i18n._(msg`Minimum number of instances that will be automatically
          assigned to this group when new instances come online.`)}
          content={instanceGroup.policy_instance_minimum}
        />
        <DetailBadge
          label={i18n._(msg`Policy instance percentage`)}
          helpText={i18n._(msg`Minimum percentage of all instances that will be automatically
          assigned to this group when new instances come online.`)}
          dataCy="instance-group-policy-instance-percentage"
          content={`${instanceGroup.policy_instance_percentage} %`}
        />
        <DetailBadge
          label={i18n._(msg`Max concurrent jobs`)}
          dataCy="instance-group-max-concurrent-jobs"
          helpText={i18n._(msg`Maximum number of jobs to run concurrently on this group.
          Zero means no limit will be enforced.`)}
          content={instanceGroup.max_concurrent_jobs}
        />
        <DetailBadge
          label={i18n._(msg`Max forks`)}
          dataCy="instance-group-max-forks"
          helpText={i18n._(msg`Maximum number of forks to allow across all jobs running concurrently on this group.
          Zero means no limit will be enforced.`)}
          content={instanceGroup.max_forks}
        />
        {instanceGroup.capacity ? (
          <DetailBadge
            label={i18n._(msg`Used capacity`)}
            content={`${Math.round(
              100 - instanceGroup.percent_capacity_remaining
            )} %`}
            dataCy="instance-group-used-capacity"
          />
        ) : (
          <Detail
            label={i18n._(msg`Used capacity`)}
            value={<Unavailable>{i18n._(msg`Unavailable`)}</Unavailable>}
            dataCy="instance-group-used-capacity"
          />
        )}
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={instanceGroup.created}
          user={instanceGroup.summary_fields.created_by}
        />
        <UserDateDetail
          label={i18n._(msg`Last Modified`)}
          date={instanceGroup.modified}
          user={instanceGroup.summary_fields.modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {instanceGroup.summary_fields.user_capabilities &&
          instanceGroup.summary_fields.user_capabilities.edit && (
            <Button
              ouiaId="instance-group-detail-edit-button"
              aria-label={i18n._(msg`edit`)}
              component={Link}
              to={`/instance_groups/${id}/edit`}
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
        {instanceGroup.summary_fields.user_capabilities &&
          instanceGroup.summary_fields.user_capabilities.delete && (
            <DeleteButton
              ouiaId="instance-group-detail-delete-button"
              name={name}
              modalTitle={i18n._(msg`Delete instance group`)}
              onConfirm={deleteInstanceGroup}
              isDisabled={isLoading}
              deleteDetailsRequests={deleteDetailsRequests}
              deleteMessage={i18n._(msg`This instance group is currently being by other resources. Are you sure you want to delete it?`)}
            >
              {i18n._(msg`Delete`)}
            </DeleteButton>
          )}
      </CardActionsRow>
      {error && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={i18n._(msg`Error`)}
          variant="error"
        >
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default InstanceGroupDetails;
