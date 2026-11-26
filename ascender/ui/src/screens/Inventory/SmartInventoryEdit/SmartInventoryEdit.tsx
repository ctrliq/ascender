import type { AnyInventory, OptionsResponse, SummaryFieldRef } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import useRequest from 'hooks/useRequest';
import { InventoriesAPI } from 'api';
import { CardBody } from 'components/Card';
import SmartInventoryForm from '../shared/SmartInventoryForm';
import type { SmartInventoryFormValues } from '../shared/SmartInventoryForm';
import parseHostFilter from '../shared/utils';

export interface SmartInventoryEditProps {
  /** What the form draws with, read by the screen above rather than here. */
  formOptions: OptionsResponse;
  /** The inventory's instance groups, read by the screen above. */
  instanceGroups: SummaryFieldRef[];
  inventory: AnyInventory;
  [key: string]: unknown;
}

function SmartInventoryEdit({
  inventory,
  formOptions,
  instanceGroups,
}: SmartInventoryEditProps) {
  const navigate = useNavigate();
  const detailsUrl = `/inventories/smart_inventory/${inventory.id}/details`;

  const {
    error: submitError,
    request: submitRequest,
    result: submitResult,
  } = useRequest(
    useCallback(
      // The body the api takes rather than what the form holds: the
      // organization is sent as the id the lookup picked.
      async (
        values: Record<string, unknown>,
        groupsToAssociate: SummaryFieldRef[],
        groupsToDisassociate: SummaryFieldRef[]
      ) => {
        const { data } = await InventoriesAPI.update(inventory.id, values);
        await InventoriesAPI.orderInstanceGroups(
          inventory.id,
          groupsToAssociate,
          groupsToDisassociate
        );
        return data;
      },
      [inventory.id]
    )
  );

  useEffect(() => {
    if (submitResult) {
      navigate({
        pathname: detailsUrl,
        search: '',
      });
    }
    // navigate is not referentially stable in react-router-dom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitResult, detailsUrl]);

  const handleSubmit = async (form: SmartInventoryFormValues) => {
    const modifiedForm = parseHostFilter(form);
    const { instance_groups, organization, ...remainingForm } = modifiedForm;

    await submitRequest(
      {
        organization: organization?.id,
        ...remainingForm,
      },
      instance_groups ?? [],
      instanceGroups
    );
  };

  const handleCancel = () => {
    navigate({
      pathname: detailsUrl,
      search: '',
    });
  };

  return (
    <CardBody>
      <SmartInventoryForm
        inventory={inventory}
        instanceGroups={instanceGroups}
        options={formOptions}
        onCancel={handleCancel}
        onSubmit={handleSubmit}
        submitError={submitError}
      />
    </CardBody>
  );
}

export default SmartInventoryEdit;
