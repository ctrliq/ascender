import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import { OrganizationsAPI } from 'api';
import UserForm from '../shared/UserForm';

function UserAdd() {
  const [formSubmitError, setFormSubmitError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setFormSubmitError(null);
    const { organization, ...userValues } = values;
    try {
      const {
        data: { id },
      } = await OrganizationsAPI.createUser(organization.id, userValues);
      navigate(`/users/${id}/details`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/users`);
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <UserForm
            handleCancel={handleCancel}
            handleSubmit={handleSubmit}
            submitError={formSubmitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default UserAdd;
