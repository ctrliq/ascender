import React from 'react';
import { Link } from 'react-router';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { useLingui } from '@lingui/react/macro';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem } from 'components/PaginatedTable';

function OrganizationTeamListItem({ team, detailUrl }) {
  const { t } = useLingui();
  return (
    <Tr id={`team-row-${team.id}`} ouiaId={`team-row-${team.id}`}>
      <Td dataLabel={t`Name`}>
        <Link to={`${detailUrl}/details`}>
          <b>{team.name}</b>
        </Link>
      </Td>
      <ActionsTd dataLabel={t`Actions`}>
        <ActionItem
          visible={team.summary_fields.user_capabilities.edit}
          tooltip={t`Edit Team`}
        >
          <Button icon={<PencilAltIcon />}
            ouiaId={`${team.id}-edit-button`}
            aria-label={t`Edit Team`}
            css="grid-column: 2"
            variant="plain"
            component={Link}
            to={`${detailUrl}/edit`}
           />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

export default OrganizationTeamListItem;
