import React, { useCallback, useEffect } from 'react';
import { Link, useNavigate  } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import {
	Button,
	Label,
	LabelGroup
} from '@patternfly/react-core';

import { InventoriesAPI, FederatedInventoriesAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import ChipGroup from 'components/ChipGroup';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';

function FederatedInventoryDetail({ inventory }) {
  const { t } = useLingui();
  const navigate = useNavigate();

  const {
    result: { inputInventories, actions },
    request: fetchRelatedDetails,
    error: contentError,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const [inputInventoriesResponse, optionsResponse] = await Promise.all([
        InventoriesAPI.readInputInventories(inventory.id),
        FederatedInventoriesAPI.readOptions(),
      ]);

      return {
        inputInventories: inputInventoriesResponse.data.results,
        actions: optionsResponse.data.actions.GET,
      };
    }, [inventory.id]),
    {
      inputInventories: [],
      actions: {},
      isLoading: true,
    }
  );

  useEffect(() => {
    fetchRelatedDetails();
  }, [fetchRelatedDetails]);

  const { request: deleteInventory, error: deleteError } = useRequest(
    useCallback(async () => {
      await InventoriesAPI.destroy(inventory.id);
      navigate(`/inventories`);
    }, [inventory.id, navigate])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  const deleteDetailsRequests =
    relatedResourceDeleteRequests(t).inventory(inventory);

  if (isLoading) {
    return <ContentLoading />;
  }

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={t`Name`}
          value={inventory.name}
          dataCy="federated-inventory-name"
        />
        <Detail
          label={t`Description`}
          value={inventory.description}
          dataCy="federated-inventory-description"
        />
        <Detail
          label={t`Type`}
          value={t`Federated Inventory`}
          dataCy="federated-inventory-type"
        />
        <Detail
          label={t`Organization`}
          dataCy="federated-inventory-organization"
          value={
            <Link
              to={`/organizations/${inventory.summary_fields?.organization.id}/details`}
            >
              {inventory.summary_fields?.organization.name}
            </Link>
          }
        />
        <Detail
          label={t`Total hosts`}
          value={inventory.total_hosts}
          helpText={actions?.total_hosts?.help_text}
          dataCy="federated-inventory-total-hosts"
        />
        <Detail
          label={t`Total groups`}
          value={inventory.total_groups}
          helpText={actions?.total_groups?.help_text}
          dataCy="federated-inventory-total-groups"
        />
        <Detail
          fullWidth
          helpText={actions?.labels?.help_text}
          dataCy="federated-inventory-labels"
          label={t`Labels`}
          value={
            <ChipGroup
              numChips={5}
              totalChips={inventory.summary_fields.labels?.results?.length}
            >
              {inventory.summary_fields.labels?.results?.map((l) => (
                <Label variant="outline" key={l.id} >
                  {l.name}
                </Label>
              ))}
            </ChipGroup>
          }
          isEmpty={inventory.summary_fields.labels?.results?.length === 0}
        />
        <Detail
          fullWidth
          label={t`Input Inventories`}
          helpText={t`Source inventories whose hosts will be routed to their respective instance groups when a job is launched against this federated inventory.`}
          value={
            <LabelGroup numLabels={5}>
              {inputInventories?.map((inputInventory) => (
                <Label
                  color="blue"
                  key={inputInventory.id}
                  render={({ className, content, componentRef }) => (
                    <Link
                      className={className}
                      ref={componentRef}
                      to={`/inventories/inventory/${inputInventory.id}/details`}
                    >
                      {content}
                    </Link>
                  )}
                >
                  {inputInventory.name}
                </Label>
              ))}
            </LabelGroup>
          }
          isEmpty={inputInventories?.length === 0}
        />
        <UserDateDetail
          label={t`Created`}
          date={inventory.created}
          user={inventory.summary_fields.created_by}
        />
        <UserDateDetail
          label={t`Modified`}
          date={inventory.modified}
          user={inventory.summary_fields.modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {inventory?.summary_fields?.user_capabilities?.edit && (
          <Button
            ouiaId="federated-inventory-detail-edit-button"
            component={Link}
            to={`/inventories/federated_inventory/${inventory.id}/edit`}
          >
            {t`Edit`}
          </Button>
        )}
        {inventory?.summary_fields?.user_capabilities?.delete && (
          <DeleteButton
            name={inventory.name}
            modalTitle={t`Delete Inventory`}
            onConfirm={deleteInventory}
            deleteDetailsRequests={deleteDetailsRequests}
            deleteMessage={t`This inventory is currently being used by other resources. Are you sure you want to delete it?`}
          >
            {t`Delete`}
          </DeleteButton>
        )}
      </CardActionsRow>
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={t`Error!`}
          onClose={dismissError}
        >
          {t`Failed to delete inventory.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default FederatedInventoryDetail;
