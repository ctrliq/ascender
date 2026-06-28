import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';
import HostForm from 'components/HostForm';
import { HostsAPI } from 'api';

function HostEdit({ host }) {
  const [formError, setFormError] = useState(null);
  const detailsUrl = `/hosts/${host.id}/details`;
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    try {
      const dataToSend = { ...values };
      if (dataToSend.inventory) {
        dataToSend.inventory = dataToSend.inventory.id;
      }
      await HostsAPI.update(host.id, dataToSend);
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
