import React, { useState } from 'react';

import { useNavigate, useParams } from 'react-router';
import { GroupsAPI } from 'api';

import InventoryGroupForm from '../shared/InventoryGroupForm';

function InventoryGroupEdit({ inventoryGroup }) {
  const [error, setError] = useState(null);
  const { id, groupId } = useParams();
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
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
