import React from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Tr, Td } from '@patternfly/react-table';

function UserTeamListItem({ team, isSelected, onSelect, rowIndex }) {
  const { t } = useLingui();
  return (
    <Tr id={`user-team-row-${team.id}`} ouiaId={`user-team-row-${team.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
      />
      <Td id={`team-${team.id}`} dataLabel={t`Name`}>
        <Link to={`/teams/${team.id}/details`}>
          <b>{team.name}</b>
        </Link>
      </Td>
      <Td dataLabel={t`Organization`}>
        {team.summary_fields.organization ? (
          <Link
            to={`/organizations/${team.summary_fields.organization.id}/details`}
          >
            {team.summary_fields.organization.name}
          </Link>
        ) : null}
      </Td>
      <Td dataLabel={t`Description`}>{team.description}</Td>
    </Tr>
  );
}

export default UserTeamListItem;
