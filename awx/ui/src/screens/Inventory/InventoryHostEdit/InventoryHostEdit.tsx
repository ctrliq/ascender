import type { AnyInventory, Host } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import HostForm from 'components/HostForm';

import { HostsAPI } from 'api';
import type { HostFormValues } from 'components/HostForm/HostForm';

export interface InventoryHostEditProps {
  host: Host;
  inventory: AnyInventory;
  [key: string]: unknown;
}

function InventoryHostEdit({ host, inventory }: InventoryHostEditProps) {
  const [formError, setFormError] = useState<unknown>(null);
  const detailsUrl = `/inventories/inventory/${inventory.id}/hosts/${host.id}/details`;
  const navigate = useNavigate();

  const handleSubmit = async (values: HostFormValues) => {
    try {
      await HostsAPI.update(host.id, values);
      navigate(detailsUrl);
    } catch (error) {
      setFormError(error);
    }
  };

  const handleCancel = () => {
    navigate(detailsUrl);
  };

  return (
    <CardBody>
      <HostForm
        host={host}
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
        isInventoryVisible={false}
        submitError={formError}
      />
    </CardBody>
  );
}

export default InventoryHostEdit;
