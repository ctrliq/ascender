import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { CardBody } from 'components/Card';

import { TeamsAPI } from 'api';
import { Config } from 'contexts/Config';

import TeamForm from '../shared/TeamForm';

function TeamEdit({ team }) {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  const handleSubmit = async (values) => {
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
