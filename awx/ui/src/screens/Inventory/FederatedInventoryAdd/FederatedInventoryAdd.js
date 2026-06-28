import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { FederatedInventoriesAPI, InventoriesAPI } from 'api';
import { CardBody } from 'components/Card';
import FederatedInventoryForm from '../shared/FederatedInventoryForm';

function FederatedInventoryAdd() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);

  const handleCancel = () => {
    navigate('/inventories');
  };

  const handleSubmit = async (values) => {
    try {
      const {
        data: { id: inventoryId },
      } = await FederatedInventoriesAPI.create({
        name: values.name,
        description: values.description,
        organization: values.organization?.id,
        kind: 'federated',
      });
      /* eslint-disable no-await-in-loop, no-restricted-syntax */
      for (const inputInventory of values.inputInventories) {
        await InventoriesAPI.associateInventory(inventoryId, inputInventory.id);
      }
      /* eslint-enable no-await-in-loop, no-restricted-syntax */

      navigate(`/inventories/federated_inventory/${inventoryId}/details`);
    } catch (error) {
      setSubmitError(error);
    }
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <FederatedInventoryForm
            onCancel={handleCancel}
            onSubmit={handleSubmit}
            submitError={submitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default FederatedInventoryAdd;
