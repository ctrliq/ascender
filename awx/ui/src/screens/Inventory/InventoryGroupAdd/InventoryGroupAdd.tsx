import React, { useState } from 'react';

import { useNavigate, useParams } from 'react-router';
import { Card } from '@patternfly/react-core';
import { GroupsAPI } from 'api';
import type { InventoryGroupFormValues } from '../shared/InventoryGroupForm';

import InventoryGroupForm from '../shared/InventoryGroupForm';

function InventoryGroupsAdd() {
  const [error, setError] = useState<unknown>(null);
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();

  const handleSubmit = async (values: InventoryGroupFormValues) => {
    try {
      const { data } = await GroupsAPI.create({ ...values, inventory: id });
      navigate(`/inventories/inventory/${id}/groups/${data.id}`);
    } catch (err) {
      setError(err);
    }
  };

  const handleCancel = () => {
    navigate(`/inventories/inventory/${id}/groups`);
  };

  return (
    <Card>
      <InventoryGroupForm
        error={error}
        handleCancel={handleCancel}
        handleSubmit={handleSubmit}
      />
    </Card>
  );
}
export default InventoryGroupsAdd;
export { InventoryGroupsAdd as _InventoryGroupsAdd };
