import type { Untyped } from 'types/api';
import React, { useState } from 'react';

import { useNavigate, useParams } from 'react-router';
import { Card } from '@patternfly/react-core';
import { GroupsAPI } from 'api';

import InventoryGroupForm from '../shared/InventoryGroupForm';

function InventoryGroupsAdd() {
  const [error, setError] = useState<Untyped>(null);
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();

  const handleSubmit = async (values: Untyped) => {
    values.inventory = id;
    try {
      const { data } = await GroupsAPI.create(values);
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
