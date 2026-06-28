import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { InstanceGroupsAPI } from 'api';
import InstanceGroupForm from '../shared/InstanceGroupForm';

function InstanceGroupEdit({ instanceGroup }) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);
  const detailsUrl = `/instance_groups/${instanceGroup.id}/details`;

  const handleSubmit = async (values) => {
    try {
      await InstanceGroupsAPI.update(instanceGroup.id, values);
      navigate(detailsUrl);
    } catch (error) {
      setSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(detailsUrl);
  };

  return (
    <CardBody>
      <InstanceGroupForm
        instanceGroup={instanceGroup}
        onSubmit={handleSubmit}
        submitError={submitError}
        onCancel={handleCancel}
      />
    </CardBody>
  );
}

export default InstanceGroupEdit;
