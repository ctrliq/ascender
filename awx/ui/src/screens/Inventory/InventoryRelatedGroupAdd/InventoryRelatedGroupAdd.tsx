import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GroupsAPI } from 'api';
import type { InventoryGroupFormValues } from '../shared/InventoryGroupForm';
import InventoryGroupForm from '../shared/InventoryGroupForm';

function InventoryRelatedGroupAdd() {
  const [error, setError] = useState<unknown>(null);
  const navigate = useNavigate();
  const { id, groupId } = useParams() as { id: string; groupId: string };
  const associateInventoryGroup = async (values: InventoryGroupFormValues) => {
    try {
      const { data } = await GroupsAPI.create({ ...values, inventory: id });
      await GroupsAPI.associateChildGroup(groupId, data.id);
      // The second argument used to carry a prevGroupId, which is not a
      // navigate option and which nothing has ever read back.
      navigate(`/inventories/inventory/${id}/groups/${data.id}/details`);
    } catch (err) {
      setError(err);
    }
  };

  const handleCancel = () => {
    navigate(`/inventories/inventory/${id}/groups/${groupId}/nested_groups`);
  };
  return (
    <InventoryGroupForm
      handleSubmit={associateInventoryGroup}
      handleCancel={handleCancel}
      error={error}
    />
  );
}

export default InventoryRelatedGroupAdd;
