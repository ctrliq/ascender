import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import useRequest from 'hooks/useRequest';
import { InventoriesAPI } from 'api';
import SmartInventoryForm from '../shared/SmartInventoryForm';
import parseHostFilter from '../shared/utils';

function SmartInventoryAdd() {
  const navigate = useNavigate();

  const {
    error: submitError,
    request: submitRequest,
    result: inventoryId,
  } = useRequest(
    useCallback(async (values, groupsToAssociate) => {
      const {
        data: { id: invId },
      } = await InventoriesAPI.create(values);

      /* eslint-disable no-await-in-loop, no-restricted-syntax */
      // Resolve Promises sequentially to maintain order and avoid race condition
      for (const group of groupsToAssociate) {
        await InventoriesAPI.associateInstanceGroup(invId, group.id);
      }
      /* eslint-enable no-await-in-loop, no-restricted-syntax */
      return invId;
    }, [])
  );

  const handleSubmit = async (form) => {
    const modifiedForm = parseHostFilter(form);

    const { instance_groups, organization, ...remainingForm } = modifiedForm;

    await submitRequest(
      {
        organization: organization?.id,
        ...remainingForm,
      },
      instance_groups
    );
  };

  const handleCancel = () => {
    navigate({
      pathname: '/inventories',
      search: '',
    });
  };

  useEffect(() => {
    if (inventoryId) {
      navigate({
        pathname: `/inventories/smart_inventory/${inventoryId}/details`,
        search: '',
      });
    }
    // navigate is not referentially stable in react-router-dom;
    // including it refires this redirect effect after unrelated navigations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryId]);

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <SmartInventoryForm
            onCancel={handleCancel}
            onSubmit={handleSubmit}
            submitError={submitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default SmartInventoryAdd;
