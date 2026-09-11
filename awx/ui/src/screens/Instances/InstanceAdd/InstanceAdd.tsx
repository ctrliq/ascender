import type { Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { InstancesAPI } from 'api';
import InstanceForm from '../Shared/InstanceForm';

function InstanceAdd() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<Untyped>();
  const handleSubmit = async (values: Untyped) => {
    try {
      if (values.listener_port === undefined) {
        values.listener_port = null;
      }

      const {
        data: { id },
      } = await InstancesAPI.create(values);

      navigate(`/instances/${id}/details`);
    } catch (err) {
      setFormError(err);
    }
  };

  const handleCancel = () => {
    navigate('/instances');
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <InstanceForm
          submitError={formError}
          handleSubmit={handleSubmit}
          handleCancel={handleCancel}
        />
      </Card>
    </PageSection>
  );
}

export default InstanceAdd;
