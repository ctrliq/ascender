import React, { useCallback } from 'react';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Link, useHistory } from 'react-router-dom';
import { Button, Label } from '@patternfly/react-core';

import { VariablesDetail } from 'components/CodeEditor';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import {
  Detail,
  DetailList,
  UserDateDetail,
  DetailBadge,
} from 'components/DetailList';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { jsonToYaml, isJsonString } from 'util/yaml';
import { InstanceGroupsAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';

function ContainerGroupDetails({ instanceGroup }) {
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
          dataCy="container-group-detail-name"
        />
        <Detail
          label={i18n._(msg`Type`)}
          value={i18n._(msg`Container group`)}
          dataCy="container-group-type"
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
        {instanceGroup.summary_fields.credential && (
          <Detail
            label={i18n._(msg`Credential`)}
            helpText={i18n._(
              msg`Credential to authenticate with Kubernetes or OpenShift`
            )}
            value={
              <Link
                to={`/credentials/${instanceGroup?.summary_fields?.credential?.id}`}
              >
                <Label variant="outline" color="blue">
                  {instanceGroup?.summary_fields?.credential?.name}
                </Label>
              </Link>
            }
            dataCy="container-group-credential"
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
        {instanceGroup.pod_spec_override && (
          <VariablesDetail
            label={i18n._(msg`Pod spec override`)}
            value={
              isJsonString(instanceGroup.pod_spec_override)
                ? jsonToYaml(instanceGroup.pod_spec_override)
                : instanceGroup.pod_spec_override
            }
            rows={6}
            helpText={i18n._(
              msg`Custom Kubernetes or OpenShift Pod specification.`
            )}
            name="pod_spec_override"
            dataCy="container-group-detail-pod-spec-override"
          />
        )}
      </DetailList>
      <CardActionsRow>
        {instanceGroup.summary_fields.user_capabilities &&
          instanceGroup.summary_fields.user_capabilities.edit && (
            <Button
              ouiaId="container-group-detail-edit-button"
              aria-label={i18n._(msg`edit`)}
              component={Link}
              to={`/instance_groups/container_group/${id}/edit`}
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
        {instanceGroup.summary_fields.user_capabilities &&
          instanceGroup.summary_fields.user_capabilities.delete && (
            <DeleteButton
              ouiaId="container-group-detail-delete-button"
              name={name}
              modalTitle={i18n._(msg`Delete instance group`)}
              onConfirm={deleteInstanceGroup}
              isDisabled={isLoading}
              deleteDetailsRequests={deleteDetailsRequests}
              deleteMessage={i18n._(
                msg`This container group is currently being by other resources. Are you sure you want to delete it?`
              )}
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

export default ContainerGroupDetails;
