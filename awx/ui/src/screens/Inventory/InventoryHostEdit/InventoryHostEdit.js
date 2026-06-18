import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { CardBody } from 'components/Card';
import HostForm from 'components/HostForm';

import { HostsAPI } from 'api';

function InventoryHostEdit({ host, inventory }) {
  const [formError, setFormError] = useState(null);
  const detailsUrl = `/inventories/inventory/${inventory.id}/hosts/${host.id}/details`;
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
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

InventoryHostEdit.propTypes = {
  host: PropTypes.shape().isRequired,
};

export default InventoryHostEdit;
