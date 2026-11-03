import type { InstanceGroup } from 'types/api';
import React, { useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';

import { Link, useNavigate } from 'react-router';
import { Button, Label } from '@patternfly/react-core';

import { VariablesDetail } from 'components/CodeEditor';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import { Detail, DetailList, UserDateDetail } from 'components/DetailList';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { jsonToYaml, isJsonString } from 'util/yaml';
import { InstanceGroupsAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';

export interface ContainerGroupDetailsProps {
  instanceGroup: InstanceGroup;
  [key: string]: unknown;
}

function ContainerGroupDetails({ instanceGroup }: ContainerGroupDetailsProps) {
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
      // The list the deleted group was in, which is not the instance groups
      // one: that list filters container groups out.
      navigate(`/container_groups`);
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
          dataCy="container-group-detail-name"
        />
        <Detail
          label={t`Type`}
          value={t`Container Group`}
          dataCy="container-group-type"
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
        {instanceGroup.summary_fields.mesh_node && (
          <Detail
            label={t`Mesh node`}
            helpText={t`Hop node of the receptor mesh that runs the pods of this group in its own cluster`}
            value={
              <Link
                to={`/instances/${instanceGroup.summary_fields.mesh_node.id}/details`}
              >
                <Label variant="outline" color="blue">
                  {instanceGroup.summary_fields.mesh_node.hostname}
                </Label>
              </Link>
            }
            dataCy="container-group-mesh-node"
          />
        )}
        {instanceGroup.summary_fields.credential && (
          <Detail
            label={t`Credential`}
            helpText={t`Credential to authenticate with Kubernetes or OpenShift`}
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
          label={t`Created`}
          date={instanceGroup.created}
          user={instanceGroup.summary_fields.created_by}
        />
        <UserDateDetail
          label={t`Last Modified`}
          date={instanceGroup.modified}
          user={instanceGroup.summary_fields.modified_by}
        />
        {instanceGroup.pod_spec_override && (
          <VariablesDetail
            label={t`Pod Spec Override`}
            value={
              isJsonString(instanceGroup.pod_spec_override)
                ? jsonToYaml(instanceGroup.pod_spec_override)
                : instanceGroup.pod_spec_override
            }
            rows={6}
            helpText={t`Custom Kubernetes or OpenShift Pod specification.`}
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
              aria-label={t`Edit`}
              component={Link}
              to={`/container_groups/${id}/edit`}
            >
              {t`Edit`}
            </Button>
          )}
        {instanceGroup.summary_fields.user_capabilities &&
          instanceGroup.summary_fields.user_capabilities.delete && (
            <DeleteButton
              ouiaId="container-group-detail-delete-button"
              name={name}
              modalTitle={t`Delete Container Group`}
              onConfirm={deleteInstanceGroup}
              isDisabled={isLoading}
              deleteDetailsRequests={deleteDetailsRequests}
              deleteMessage={t`This container group is currently being used by other resources. Are you sure you want to delete it?`}
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

export default ContainerGroupDetails;
