import type { AnyInventory, Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import HostForm from 'components/HostForm';

import { HostsAPI } from 'api';

export interface InventoryHostAddProps {
  inventory: AnyInventory;
  [key: string]: unknown;
}

function InventoryHostAdd({ inventory }: InventoryHostAddProps) {
  const [formError, setFormError] = useState<unknown>(null);
  const hostsUrl = `/inventories/inventory/${inventory.id}/hosts`;
  const navigate = useNavigate();

  const handleSubmit = async (formData: Untyped) => {
    try {
      const values = {
        ...formData,
        inventory: inventory.id,
      };
      const { data: response } = await HostsAPI.create(values);
      navigate(`${hostsUrl}/${response.id}/details`);
    } catch (error) {
      setFormError(error);
    }
  };

  const handleCancel = () => {
    navigate(hostsUrl);
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

export default InventoryHostAdd;
