import type { Team, Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';

import { TeamsAPI } from 'api';
import { Config } from 'contexts/Config';

import TeamForm from '../shared/TeamForm';

export interface TeamEditProps {
  team: Team;
  [key: string]: unknown;
}

function TeamEdit({ team }: TeamEditProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);

  const handleSubmit = async (values: Untyped) => {
    try {
      const valuesToSend = { ...values };
      if (valuesToSend.organization) {
        valuesToSend.organization = valuesToSend.organization.id;
      }
      await TeamsAPI.update(team.id, valuesToSend);
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
      <Config>
        {({ me }) => (
          <TeamForm
            team={team}
            handleSubmit={handleSubmit}
            handleCancel={handleCancel}
            me={me || {}}
            submitError={error}
          />
        )}
      </Config>
    </CardBody>
  );
}

export default TeamEdit;
