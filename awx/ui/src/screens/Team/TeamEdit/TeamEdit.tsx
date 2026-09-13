import type { Team } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';

import { TeamsAPI } from 'api';

import TeamForm from '../shared/TeamForm';
import type { TeamFormValues } from '../shared/TeamForm';

export interface TeamEditProps {
  team: Team;
}

function TeamEdit({ team }: TeamEditProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);

  const handleSubmit = async (values: TeamFormValues) => {
    try {
      await TeamsAPI.update(team.id, {
        ...values,
        organization: values.organization?.id,
      });
      navigate(`/teams/${team.id}/details`);
    } catch (err) {
      setError(err);
    }
  };

  const handleCancel = () => {
    navigate(`/teams/${team.id}/details`);
  };

  return (
    <CardBody>
      <TeamForm
        team={team}
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
        submitError={error}
      />
    </CardBody>
  );
}

export default TeamEdit;
