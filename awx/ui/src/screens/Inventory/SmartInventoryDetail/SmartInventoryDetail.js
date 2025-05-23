import React, { useCallback, useEffect } from 'react';
import { Link, useHistory } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Button, Label } from '@patternfly/react-core';

import { Inventory } from 'types';
import { InventoriesAPI, UnifiedJobsAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import { VariablesDetail } from 'components/CodeEditor';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import DeleteButton from 'components/DeleteButton';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import ErrorDetail from 'components/ErrorDetail';
import Sparkline from 'components/Sparkline';
import InstanceGroupLabels from 'components/InstanceGroupLabels';

function SmartInventoryDetail({ inventory }) {
  const { i18n } = useLingui();
  const history = useHistory();
  const {
    created,
    description,
    host_filter,
    id,
    modified,
    name,
    total_hosts,
    variables,
    summary_fields: {
      created_by,
      modified_by,
      organization,
      user_capabilities,
    },
  } = inventory;

  const {
    error: contentError,
    isLoading: hasContentLoading,
    request: fetchData,
    result: { recentJobs, instanceGroups },
  } = useRequest(
    useCallback(async () => {
      const params = {
        or__job__inventory: id,
        or__workflowjob__inventory: id,
        order_by: '-finished',
        page_size: 10,
      };
      const [{ data: jobData }, { data: igData }] = await Promise.all([
        UnifiedJobsAPI.read(params),
        InventoriesAPI.readInstanceGroups(id),
      ]);
      return {
        recentJobs: jobData.results,
        instanceGroups: igData.results,
      };
    }, [id]),
    {
      recentJobs: [],
      instanceGroups: [],
    }
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const {
    error: deleteError,
    isLoading,
    request: handleDelete,
  } = useRequest(
    useCallback(async () => {
      await InventoriesAPI.destroy(id);
      history.push(`/inventories`);
    }, [id, history])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  if (hasContentLoading) {
    return <ContentLoading />;
  }

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  return (
    <>
      <CardBody>
        <DetailList>
          <Detail label={i18n._(msg`Name`)} value={name} />
          <Detail
            label={i18n._(msg`Activity`)}
            value={<Sparkline jobs={recentJobs} />}
            isEmpty={recentJobs.length === 0}
          />
          <Detail label={i18n._(msg`Description`)} value={description} />
          <Detail label={i18n._(msg`Type`)} value={i18n._(msg`Smart inventory`)} />
          <Detail
            label={i18n._(msg`Organization`)}
            value={
              <Link to={`/organizations/${organization.id}/details`}>
                {organization.name}
              </Link>
            }
          />
          <Detail
            fullWidth
            label={i18n._(msg`Smart host filter`)}
            value={<Label variant="outline">{host_filter}</Label>}
          />
          <Detail label={i18n._(msg`Total hosts`)} value={total_hosts} />
          <Detail
            fullWidth
            label={i18n._(msg`Instance groups`)}
            value={<InstanceGroupLabels labels={instanceGroups} />}
            isEmpty={instanceGroups.length === 0}
          />
          <VariablesDetail
            label={i18n._(msg`Variables`)}
            value={variables}
            rows={4}
            name="variables"
            dataCy="smart-inventory-detail-variables"
          />
          <UserDateDetail label={i18n._(msg`Created`)} date={created} user={created_by} />
          <UserDateDetail
            label={i18n._(msg`Last modified`)}
            date={modified}
            user={modified_by}
          />
        </DetailList>
        <CardActionsRow>
          {user_capabilities?.edit && (
            <Button
              ouiaId="smart-inventory-detail-edit-button"
              component={Link}
              aria-label={i18n._(msg`edit`)}
              to={`/inventories/smart_inventory/${id}/edit`}
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
          {user_capabilities?.delete && (
            <DeleteButton
              name={name}
              modalTitle={i18n._(msg`Delete smart inventory`)}
              onConfirm={handleDelete}
              isDisabled={isLoading}
            >
              {i18n._(msg`Delete`)}
            </DeleteButton>
          )}
        </CardActionsRow>
      </CardBody>
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to delete smart inventory.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

SmartInventoryDetail.propTypes = {
  inventory: Inventory.isRequired,
};

export default SmartInventoryDetail;
