import type { Host } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import HostForm from 'components/HostForm';
import type { HostFormValues } from 'components/HostForm/HostForm';
import { HostsAPI } from 'api';

export interface HostEditProps {
  host: Host;
  [key: string]: unknown;
}

function HostEdit({ host }: HostEditProps) {
  const [formError, setFormError] = useState<unknown>(null);
  const detailsUrl = `/hosts/${host.id}/details`;
  const navigate = useNavigate();

  const handleSubmit = async (values: HostFormValues) => {
    try {
      await HostsAPI.update(host.id, {
        ...values,
        inventory: values.inventory?.id,
      });
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
        submitError={formError}
        disableInventoryLookup
      />
    </CardBody>
  );
}

export default HostEdit;
