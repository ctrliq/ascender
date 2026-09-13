import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageSection, Card } from '@patternfly/react-core';
import HostForm from 'components/HostForm';
import { CardBody } from 'components/Card';
import { HostsAPI } from 'api';
import type { HostFormValues } from 'components/HostForm/HostForm';

function HostAdd() {
  const [formError, setFormError] = useState<unknown>(null);
  const navigate = useNavigate();

  const handleSubmit = async (formData: HostFormValues) => {
    try {
      const { data: response } = await HostsAPI.create({
        ...formData,
        inventory: formData.inventory?.id,
      });
      navigate(`/hosts/${response.id}/details`);
    } catch (error) {
      setFormError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/hosts`);
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <HostForm
            handleSubmit={handleSubmit}
            handleCancel={handleCancel}
            submitError={formError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default HostAdd;
