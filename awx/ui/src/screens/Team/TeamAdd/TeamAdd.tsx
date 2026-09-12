import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageSection, Card } from '@patternfly/react-core';

import { TeamsAPI } from 'api';
import { CardBody } from 'components/Card';
import type { TeamFormValues } from '../shared/TeamForm';
import TeamForm from '../shared/TeamForm';

function TeamAdd() {
  const [submitError, setSubmitError] = useState<unknown>(null);
  const navigate = useNavigate();

  const handleSubmit = async (values: TeamFormValues) => {
    try {
      const { name, description, organization } = values;
      const valuesToSend = {
        name,
        description,
        organization: organization?.id,
      };
      const { data: response } = await TeamsAPI.create(valuesToSend);
      navigate(`/teams/${response.id}`);
    } catch (error) {
      setSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate('/teams');
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <TeamForm
            handleSubmit={handleSubmit}
            handleCancel={handleCancel}
            submitError={submitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export { TeamAdd as _TeamAdd };
export default TeamAdd;
