import type { InstanceGroup } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { InstanceGroupsAPI } from 'api';
import InstanceGroupForm from '../shared/InstanceGroupForm';
import type { InstanceGroupFormValues } from '../shared/InstanceGroupForm';

export interface InstanceGroupEditProps {
  instanceGroup: InstanceGroup;
  [key: string]: unknown;
}

function InstanceGroupEdit({ instanceGroup }: InstanceGroupEditProps) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const detailsUrl = `/instance_groups/${instanceGroup.id}/details`;

  const handleSubmit = async (values: InstanceGroupFormValues) => {
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
