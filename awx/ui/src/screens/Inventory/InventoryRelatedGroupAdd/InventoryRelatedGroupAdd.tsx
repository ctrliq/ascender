import type { Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { GroupsAPI } from 'api';
import InventoryGroupForm from '../shared/InventoryGroupForm';

function InventoryRelatedGroupAdd() {
  const [error, setError] = useState<Untyped>(null);
  const navigate = useNavigate();
  const { id, groupId } = useParams() as { id: string; groupId: string };
  const associateInventoryGroup = async (values: Untyped) => {
    values.inventory = id;
    try {
      const { data } = await GroupsAPI.create(values);
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
