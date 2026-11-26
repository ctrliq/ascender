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
/**
 * One role a user or a team holds on a resource. A role granted through a team
 * carries that team's id and name, which is what the chips are grouped by.
 */
export interface AccessRole {
  id: number;
  name?: string | null;
  team_id?: number;
  team_name?: string;
  user_capabilities?: { unattach?: boolean };
  [key: string]: unknown;
}

export interface AccessRecord {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  summary_fields?: {
    direct_access?: { role: AccessRole }[];
    indirect_access?: { role: AccessRole }[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * The roles a toolbar Disassociate takes off a row: the ones given to the user
 * directly on this resource, which the api lets this viewer remove. A role held
 * through a team is the team's, and taking it would take it from every member;
 * one inherited from an organization or a parent is not removable here at all.
 * Both stay, and the chips remain the way to handle a team's role one by one.
 */
export const removableRoles = (record: AccessRecord): AccessRole[] =>
  (record.summary_fields?.direct_access ?? [])
    .map(({ role }) => role)
    .filter((role) => !role.team_id && role.user_capabilities?.unattach);

export interface ResourceAccessListItemProps {
  accessRecord: AccessRecord;
  /** Whether the row is ticked for the toolbar's Disassociate, and the tick. */
  isSelected?: boolean;
  onSelect?: () => void;
  rowIndex?: number;
  /** Takes one role off this row, which the list confirms before it does. */
  onRoleDelete: (role: AccessRole, record: AccessRecord) => void;
  /**
   * The ids of the roles that belong to the resource itself, its object roles.
   * Only a chip for one of these can be closed.
   */
  resourceRoleIds?: number[];
  [key: string]: unknown;
}

function ResourceAccessListItem({
  accessRecord,
  onRoleDelete,
  resourceRoleIds = [],
  isSelected = false,
  onSelect,
  rowIndex,
}: ResourceAccessListItemProps) {
  const getRoleLists = () => {
    const teamRoles: AccessRole[] = [];
    const userRoles: AccessRole[] = [];

    function sort(item: { role: AccessRole }) {
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

  /*
   * A chip can be closed only on a role of this resource itself, held directly
   * or through a team, that the api lets this viewer take off. The api lists a
   * team's inherited roles among the direct ones too, the organization's
   * admin role on a team that administers the organization for one, so being
   * in direct_access is not enough: the role has to be one of the resource's
   * own. An inherited one lives on the organization or parent it comes from,
   * and closing it here would take away far more than this resource's access.
   */
  const directRoles = new Set(
    (accessRecord.summary_fields?.direct_access ?? []).map(({ role }) => role)
  );
  const ownRoleIds = new Set(resourceRoleIds);
  const canDisassociate = (role: AccessRole) =>
    directRoles.has(role) &&
    ownRoleIds.has(role.id) &&
    Boolean(role.user_capabilities?.unattach);

  const renderChip = (role: AccessRole) => (
    <Label
      variant="outline"
      key={role.id}
      onClose={
        canDisassociate(role)
          ? () => {
              onRoleDelete(role, accessRecord);
            }
          : undefined
      }
      data-ouia-component-id={`${role.name}-${role.id}`}
      closeBtnAriaLabel={t`Disassociate ${role.name}`}
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
      <Td
        select={{
          rowIndex: rowIndex ?? 0,
          isSelected,
          onSelect: () => onSelect?.(),
          isDisabled: removableRoles(accessRecord).length === 0,
        }}
        dataLabel={t`Selected`}
      />
      <Td id={`access-record-${accessRecord.id}`} dataLabel={t`Username`}>
        {accessRecord.id ? (
          <Link to={{ pathname: `/users/${accessRecord.id}/details` }}>
            <b>{accessRecord.username}</b>
          </Link>
        ) : (
          <b>{accessRecord.username}</b>
        )}
      </Td>
      <Td dataLabel={t`First Name`}>{accessRecord.first_name}</Td>
      <Td dataLabel={t`Last Name`}>{accessRecord.last_name}</Td>
      <Td dataLabel={t`Roles`}>
        <DetailList stacked>
          <Detail
            label={t`User Roles`}
            value={
              <ChipGroup
                numChips={5}
                totalChips={userRoles?.length ?? 0}
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
                totalChips={teamRoles?.length ?? 0}
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
