import type { SummaryFieldRef } from 'types/api';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PageSection, Card } from '@patternfly/react-core';

import { TeamsAPI } from 'api';
import { CardBody } from 'components/Card';
import type { TeamFormValues } from '../shared/TeamForm';
import TeamForm from '../shared/TeamForm';

function TeamAdd() {
  const [submitError, setSubmitError] = useState<unknown>(null);
  const navigate = useNavigate();
  /*
   * An organization's Teams tab sends its organization along, so the team is
   * created in it without the reader picking it again, and Cancel goes back
   * to that tab rather than to the list of every team.
   */
  const { state } = useLocation() as {
    state?: { organization?: SummaryFieldRef } | null;
  };
  const organization = state?.organization ?? null;

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
    navigate(
      organization ? `/organizations/${organization.id}/teams` : '/teams'
    );
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <TeamForm
            team={
              organization ? { summary_fields: { organization } } : undefined
            }
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
