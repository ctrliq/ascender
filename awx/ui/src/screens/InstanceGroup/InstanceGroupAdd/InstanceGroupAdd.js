import React, { useState } from 'react';
import { Card, PageSection } from '@patternfly/react-core';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { InstanceGroupsAPI } from 'api';
import InstanceGroupForm from '../shared/InstanceGroupForm';

function InstanceGroupAdd() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);

  const handleSubmit = async (values) => {
    try {
      const { data: response } = await InstanceGroupsAPI.create(values);
      navigate(`/instance_groups/${response.id}/details`);
    } catch (error) {
      setSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/instance_groups`);
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <InstanceGroupForm
            onSubmit={handleSubmit}
            submitError={submitError}
            onCancel={handleCancel}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default InstanceGroupAdd;
