import type { Untyped } from 'types/api';
import React, { useState } from 'react';

import { useNavigate, useParams } from 'react-router';
import { GroupsAPI } from 'api';

import InventoryGroupForm from '../shared/InventoryGroupForm';

export interface InventoryGroupEditProps {
  inventoryGroup: Untyped;
  [key: string]: unknown;
}

function InventoryGroupEdit({ inventoryGroup }: InventoryGroupEditProps) {
  const [error, setError] = useState<unknown>(null);
  const { id, groupId } = useParams() as { id: string; groupId: string };
  const navigate = useNavigate();

  const handleSubmit = async (values: Untyped) => {
    try {
      await GroupsAPI.update(groupId, values);
      navigate(`/inventories/inventory/${id}/groups/${groupId}/details`);
    } catch (err) {
      setError(err);
    }
  };

  const handleCancel = () => {
    navigate(`/inventories/inventory/${id}/groups/${groupId}`);
  };

  return (
    <InventoryGroupForm
      error={error}
      group={inventoryGroup}
      handleCancel={handleCancel}
      handleSubmit={handleSubmit}
    />
  );
}
export default InventoryGroupEdit;
export { InventoryGroupEdit as _InventoryGroupEdit };
