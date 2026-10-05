import type { AnyInventory, InventorySource, SummaryFieldRef } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Card } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useRequest from 'hooks/useRequest';
import { InventorySourcesAPI } from 'api';
import InventorySourceForm from '../shared/InventorySourceForm';
import type { InventorySourceFormValues } from '../shared/InventorySourceForm';

export interface InventorySourceEditProps {
  source: InventorySource;
  inventory: AnyInventory;
  [key: string]: unknown;
}

function InventorySourceEdit({ source, inventory }: InventorySourceEditProps) {
  const navigate = useNavigate();
  const { id, organization } = inventory;
  const detailsUrl = `/inventories/inventory/${id}/sources/${source.id}/details`;

  /*
   * Both reads in one, so this screen shows one loading state rather than its
   * own and then the form's inside it.
   */
  const {
    isLoading: isInstanceGroupsLoading,
    error: instanceGroupsError,
    request: fetchInstanceGroups,
    result: { associatedInstanceGroups, sourceOptions },
  } = useRequest(
    useCallback(async () => {
      const [{ data }, { data: options }] = await Promise.all([
        InventorySourcesAPI.readInstanceGroups(source.id),
        InventorySourcesAPI.readOptions(),
      ]);
      return { associatedInstanceGroups: data.results, sourceOptions: options };
    }, [source.id]),
    { associatedInstanceGroups: null, sourceOptions: null }
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups]);

  const { error, request, result } = useRequest(
    useCallback(
      // The body the api takes rather than what the form holds: the
      // lookups are sent as the ids they picked.
      async ({
        instanceGroups,
        ...values
      }: Record<string, unknown> & {
        instanceGroups?: SummaryFieldRef[];
      }) => {
        const { data } = await InventorySourcesAPI.replace(source.id, values);
        await InventorySourcesAPI.orderInstanceGroups(
          source.id,
          instanceGroups ?? [],
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

  const handleSubmit = async (form: InventorySourceFormValues) => {
    const {
      credential,
      source_path,
      source_project,
      source_script,
      execution_environment,
      instanceGroups,
      ...remainingForm
    } = form;

    const sourcePath: Record<string, unknown> = {};
    const sourceProject: Record<string, unknown> = {};
    if (form.source === 'scm') {
      sourcePath.source_path =
        source_path === '/ (project root)' ? '' : source_path;
      sourceProject.source_project = source_project?.id;
    }

    await request({
      /*
       * The save is a PUT, so a writable field left out of the body is reset
       * to its default. The form has no limit or timeout field, and without
       * these two an edit wiped both. They come from the source as loaded and
       * sit first so the form's own values win should it ever gain them.
       */
      limit: source.limit,
      timeout: source.timeout,
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

  if (isInstanceGroupsLoading || !associatedInstanceGroups || !sourceOptions) {
    return <ContentLoading />;
  }

  return (
    <Card>
      <CardBody>
        <InventorySourceForm
          source={source}
          sourceOptions={sourceOptions}
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
