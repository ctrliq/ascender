import type { Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { InstanceGroupsAPI } from 'api';
import InstanceGroupForm from '../shared/InstanceGroupForm';

export interface InstanceGroupEditProps {
  instanceGroup: Untyped;
  [key: string]: unknown;
}

function InstanceGroupEdit({ instanceGroup }: InstanceGroupEditProps) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<Untyped>(null);
  const detailsUrl = `/instance_groups/${instanceGroup.id}/details`;

  const handleSubmit = async (values: Untyped) => {
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
