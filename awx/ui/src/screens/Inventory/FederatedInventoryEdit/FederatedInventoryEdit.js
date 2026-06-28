import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { FederatedInventoriesAPI, InventoriesAPI } from 'api';
import { CardBody } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import useRequest from 'hooks/useRequest';
import FederatedInventoryForm from '../shared/FederatedInventoryForm';

function FederatedInventoryEdit({ inventory }) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);

  const {
    result: { inputInventories },
    error: contentError,
    request: fetchRelatedDetails,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const inputInventoriesResponse = await InventoriesAPI.readInputInventories(
        inventory.id
      );
      return {
        inputInventories: inputInventoriesResponse.data.results,
      };
    }, [inventory.id]),
    {
      inputInventories: [],
      isLoading: true,
    }
  );

  useEffect(() => {
    fetchRelatedDetails();
  }, [fetchRelatedDetails]);

  const handleCancel = () => {
    navigate(
      `/inventories/federated_inventory/${inventory.id}/details`
    );
  };

  const handleSubmit = async (values) => {
    try {
      await FederatedInventoriesAPI.update(inventory.id, {
        name: values.name,
        description: values.description,
        organization: values.organization?.id,
      });

      const currentInputInventoryIds = inputInventories.map((i) => i.id);
      const newInputInventoryIds = values.inputInventories.map((i) => i.id);

      const toAssociate = values.inputInventories.filter(
        (i) => !currentInputInventoryIds.includes(i.id)
      );
      const toDisassociate = inputInventories.filter(
        (i) => !newInputInventoryIds.includes(i.id)
      );

      /* eslint-disable no-await-in-loop, no-restricted-syntax */
      for (const inputInventory of toAssociate) {
        await InventoriesAPI.associateInventory(inventory.id, inputInventory.id);
      }
      for (const inputInventory of toDisassociate) {
        await InventoriesAPI.disassociateInventory(
          inventory.id,
          inputInventory.id
        );
      }
      /* eslint-enable no-await-in-loop, no-restricted-syntax */

      navigate(
        `/inventories/federated_inventory/${inventory.id}/details`
      );
    } catch (error) {
      setSubmitError(error);
    }
  };

  if (isLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  if (contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError} />
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <FederatedInventoryForm
            federatedInventory={inventory}
            inputInventories={inputInventories}
            onCancel={handleCancel}
            onSubmit={handleSubmit}
            submitError={submitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default FederatedInventoryEdit;
