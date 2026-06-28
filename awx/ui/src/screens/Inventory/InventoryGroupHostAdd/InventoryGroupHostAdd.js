import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import HostForm from 'components/HostForm';

import { GroupsAPI } from 'api';

function InventoryGroupHostAdd({ inventoryGroup }) {
  const [formError, setFormError] = useState(null);
  const baseUrl = `/inventories/inventory/${inventoryGroup.inventory}`;
  const navigate = useNavigate();

  const handleSubmit = async (formData) => {
    try {
      const values = {
        ...formData,
        inventory: inventoryGroup.inventory,
      };

      const { data: response } = await GroupsAPI.createHost(
        inventoryGroup.id,
        values
      );
      navigate(`${baseUrl}/hosts/${response.id}/details`);
    } catch (error) {
      setFormError(error);
    }
  };

  const handleCancel = () => {
    navigate(`${baseUrl}/groups/${inventoryGroup.id}/nested_hosts`);
  };

  return (
    <CardBody>
      <HostForm
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
        isInventoryVisible={false}
        submitError={formError}
      />
    </CardBody>
  );
}

export default InventoryGroupHostAdd;
