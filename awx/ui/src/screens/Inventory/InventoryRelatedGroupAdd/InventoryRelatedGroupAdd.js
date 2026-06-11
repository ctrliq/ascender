import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom-v5-compat';
import { GroupsAPI } from 'api';
import InventoryGroupForm from '../shared/InventoryGroupForm';

function InventoryRelatedGroupAdd() {
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { id, groupId } = useParams();
  const associateInventoryGroup = async (values) => {
    values.inventory = id;
    try {
      const { data } = await GroupsAPI.create(values);
      await GroupsAPI.associateChildGroup(groupId, data.id);
      navigate(`/inventories/inventory/${id}/groups/${data.id}/details`, {
        prevGroupId: groupId,
      });
    } catch (err) {
      setError(err);
    }
  };

  const handleCancel = () => {
    navigate(
      `/inventories/inventory/${id}/groups/${groupId}/nested_groups`
    );
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
