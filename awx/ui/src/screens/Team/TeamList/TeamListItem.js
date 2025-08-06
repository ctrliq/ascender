import React from 'react';
import 'styled-components/macro';
import { string, bool, func } from 'prop-types';
import { useLingui } from '@lingui/react';

import { t } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { Team } from 'types';

function TeamListItem({ team, isSelected, onSelect, detailUrl, rowIndex }) {
  const { i18n } = useLingui();
  TeamListItem.propTypes = {
    team: Team.isRequired,
    detailUrl: string.isRequired,
    isSelected: bool.isRequired,
    onSelect: func.isRequired,
  };

  const labelId = `check-action-${team.id}`;

  return (
    <Tr id={`team-row-${team.id}`} ouiaId={`team-row-${team.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(t`Selected`)}
      />
      <TdBreakWord id={labelId} dataLabel={i18n._(t`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{team.name}</b>
        </Link>
      </TdBreakWord>
      <TdBreakWord dataLabel={i18n._(t`Organization`)}>
        {team.summary_fields.organization && (
          <Link
            to={`/organizations/${team.summary_fields.organization.id}/details`}
          >
            <b>{team.summary_fields.organization.name}</b>
          </Link>
        )}
      </TdBreakWord>
      <ActionsTd dataLabel={i18n._(t`Actions`)}>
        <ActionItem
          visible={team.summary_fields.user_capabilities.edit}
          tooltip={i18n._(t`Edit Team`)}
        >
          <Button
            ouiaId={`${team.id}-edit-button`}
            aria-label={i18n._(t`Edit Team`)}
            variant="plain"
            component={Link}
            to={`/teams/${team.id}/edit`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}
export default TeamListItem;
