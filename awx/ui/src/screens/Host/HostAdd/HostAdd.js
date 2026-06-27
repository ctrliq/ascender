import React, { useState } from 'react';
import { useNavigate } from 'routerCompat';
import { PageSection, Card } from '@patternfly/react-core';
import HostForm from 'components/HostForm';
import { CardBody } from 'components/Card';
import { HostsAPI } from 'api';

function HostAdd() {
  const [formError, setFormError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (formData) => {
    try {
      const dataToSend = { ...formData };
      if (dataToSend.inventory) {
        dataToSend.inventory = dataToSend.inventory.id;
      }
      const { data: response } = await HostsAPI.create(dataToSend);
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
