import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Label } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router';

import ChipGroup from '../ChipGroup';
import { DetailList, Detail } from '../DetailList';

/**
 * One row of a resource's access list: a user or team, with the roles that
 * grant them access. A role is direct when it is assigned on this resource and
 * indirect when it comes from an organization or a parent object.
 */
export interface AccessRecord {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  summary_fields?: {
    direct_access?: { role: Untyped }[];
    indirect_access?: { role: Untyped }[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ResourceAccessListItemProps {
  accessRecord: AccessRecord;
  onRoleDelete: (...args: Untyped[]) => void;
  [key: string]: unknown;
}

function ResourceAccessListItem({
  accessRecord,
  onRoleDelete,
}: ResourceAccessListItemProps) {
  const getRoleLists = () => {
    const teamRoles: Untyped[] = [];
    const userRoles: Untyped[] = [];

    function sort(item: { role: Untyped }) {
      const { role } = item;
      if (role.team_id) {
        teamRoles.push(role);
      } else {
        userRoles.push(role);
      }
    }

    accessRecord.summary_fields?.direct_access?.map(sort);
    accessRecord.summary_fields?.indirect_access?.map(sort);
    return [teamRoles, userRoles] as const;
  };

  const renderChip = (role: Untyped) => (
    <Label
      variant="outline"
      key={role.id}
      onClose={() => {
        onRoleDelete(role, accessRecord);
      }}

      data-ouia-component-id={`${role.name}-${role.id}`}
      closeBtnAriaLabel={t`Remove ${role.name} chip`}
    >
      {role.name}
    </Label>
  );

  const [teamRoles, userRoles] = getRoleLists();
  const { t } = useLingui();
  return (
    <Tr
      id={`access-item-row-${accessRecord.id}`}
      ouiaId={`access-item-row-${accessRecord.id}`}
    >
      <Td id={`access-record-${accessRecord.id}`} dataLabel={t`Name`}>
        {accessRecord.id ? (
          <Link to={{ pathname: `/users/${accessRecord.id}/details` }}>
            <b>{accessRecord.username}</b>
          </Link>
        ) : (
          <b>{accessRecord.username}</b>
        )}
      </Td>
      <Td dataLabel={t`First name`}>{accessRecord.first_name}</Td>
      <Td dataLabel={t`Last name`}>{accessRecord.last_name}</Td>
      <Td dataLabel={t`Roles`}>
        <DetailList stacked>
          <Detail
            label={t`User Roles`}
            value={
              <ChipGroup
                numChips={5}
                totalChips={userRoles.length}
                ouiaId="user-role-chips"
              >
                {userRoles.map(renderChip)}
              </ChipGroup>
            }
            isEmpty={userRoles.length === 0}
          />
          <Detail
            label={t`Team Roles`}
            value={
              <ChipGroup
                numChips={5}
                totalChips={teamRoles.length}
                ouiaId="team-role-chips"
              >
                {teamRoles.map(renderChip)}
              </ChipGroup>
            }
            isEmpty={teamRoles.length === 0}
          />
        </DetailList>
      </Td>
    </Tr>
  );
}

export default ResourceAccessListItem;
