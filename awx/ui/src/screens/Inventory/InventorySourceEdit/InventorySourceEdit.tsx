import type { AnyInventory, Untyped } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Card } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useRequest from 'hooks/useRequest';
import { InventorySourcesAPI } from 'api';
import InventorySourceForm from '../shared/InventorySourceForm';

export interface InventorySourceEditProps {
  source: Untyped;
  inventory: AnyInventory;
  [key: string]: unknown;
}

function InventorySourceEdit({ source, inventory }: InventorySourceEditProps) {
  const navigate = useNavigate();
  const { id, organization } = inventory;
  const detailsUrl = `/inventories/inventory/${id}/sources/${source.id}/details`;

  const {
    isLoading: isInstanceGroupsLoading,
    error: instanceGroupsError,
    request: fetchInstanceGroups,
    result: associatedInstanceGroups,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InventorySourcesAPI.readInstanceGroups(source.id);
      return data.results;
    }, [source.id]),
    null
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups]);

  const { error, request, result } = useRequest(
    useCallback(
      async ({ instanceGroups, ...values }: Untyped) => {
        const { data } = await InventorySourcesAPI.replace(source.id, values);
        await InventorySourcesAPI.orderInstanceGroups(
          source.id,
          instanceGroups,
          associatedInstanceGroups
        );
        return data;
      },
      [source.id, associatedInstanceGroups]
    ),
    null
  );

  useEffect(() => {
    if (result) {
      navigate(detailsUrl);
    }
    // navigate is not referentially stable in react-router-dom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, detailsUrl]);

  const handleSubmit = async (form: Untyped) => {
    const {
      credential,
      source_path,
      source_project,
      source_script,
      execution_environment,
      instanceGroups,
      ...remainingForm
    } = form;

    const sourcePath: Record<string, Untyped> = {};
    const sourceProject: Record<string, Untyped> = {};
    if (form.source === 'scm') {
      sourcePath.source_path =
        source_path === '/ (project root)' ? '' : source_path;
      sourceProject.source_project = source_project.id;
    }

    await request({
      credential: credential?.id || null,
      inventory: id,
      source_script: source_script?.id || null,
      execution_environment: execution_environment?.id || null,
      instanceGroups,
      ...sourcePath,
      ...sourceProject,
      ...remainingForm,
    });
  };

  const handleCancel = () => {
    navigate(detailsUrl);
  };

  if (instanceGroupsError) {
    return (
      <Card>
        <CardBody>
          <ContentError error={instanceGroupsError} />
        </CardBody>
      </Card>
    );
  }

  if (isInstanceGroupsLoading || !associatedInstanceGroups) {
    return (
      <Card>
        <CardBody>
          <ContentLoading />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <InventorySourceForm
          source={source}
          instanceGroups={associatedInstanceGroups}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitError={error}
          organizationId={organization}
        />
      </CardBody>
    </Card>
  );
}

export default InventorySourceEdit;
