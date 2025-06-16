import React from 'react';
import { bool, func } from 'prop-types';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Tr, Td } from '@patternfly/react-table';
import { Team } from 'types';

function UserTeamListItem({ team, isSelected, onSelect, rowIndex }) {
  const { i18n } = useLingui();
  return (
    <Tr id={`user-team-row-${team.id}`} ouiaId={`user-team-row-${team.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
      />
      <Td id={`team-${team.id}`} dataLabel={i18n._(msg`Name`)}>
        <Link to={`/teams/${team.id}/details`}>
          <b>{team.name}</b>
        </Link>
      </Td>
      <Td dataLabel={i18n._(msg`Organization`)}>
        {team.summary_fields.organization ? (
          <Link
            to={`/organizations/${team.summary_fields.organization.id}/details`}
          >
            {team.summary_fields.organization.name}
          </Link>
        ) : null}
      </Td>
      <Td dataLabel={i18n._(msg`Description`)}>{team.description}</Td>
    </Tr>
  );
}

UserTeamListItem.prototype = {
  team: Team.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default UserTeamListItem;
