import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, PageSection } from '@patternfly/react-core';
import { FederatedInventoriesAPI, InventoriesAPI } from 'api';
import { CardBody } from 'components/Card';
import FederatedInventoryForm from '../shared/FederatedInventoryForm';

function FederatedInventoryAdd() {
  const history = useHistory();
  const [submitError, setSubmitError] = useState(null);

  const handleCancel = () => {
    history.push('/inventories');
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

      history.push(`/inventories/federated_inventory/${inventoryId}/details`);
    } catch (error) {
      setSubmitError(error);
    }
  };

  return (
    <PageSection>
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
