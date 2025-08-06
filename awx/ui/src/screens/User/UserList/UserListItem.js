import React from 'react';
import 'styled-components/macro';
import { string, bool, func } from 'prop-types';

import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Button, Label } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';

import { User } from 'types';

function UserListItem({ user, isSelected, onSelect, detailUrl, rowIndex }) {
  const { i18n } = useLingui();
  const labelId = `check-action-${user.id}`;

  let user_type;
  if (user.is_superuser) {
    user_type = i18n._(t`System Administrator`);
  } else if (user.is_system_auditor) {
    user_type = i18n._(t`System Auditor`);
  } else {
    user_type = i18n._(t`Normal User`);
  }

  const ldapUser = user.ldap_dn;
  const socialAuthUser = user.auth.length > 0;

  return (
    <Tr id={`user-row-${user.id}`} ouiaId={`user-row-${user.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
      />
      <TdBreakWord id={labelId} dataLabel={i18n._(t`Username`)}>
        <Link to={`${detailUrl}`}>
          <b>{user.username}</b>
        </Link>
        {ldapUser && (
          <span css="margin-left: 12px">
            <Label aria-label={i18n._(t`ldap user`)}>
              {i18n._(t`LDAP`)}
            </Label>
          </span>
        )}
        {socialAuthUser && (
          <span css="margin-left: 12px">
            <Label aria-label={i18n._(t`social login`)}>
              {i18n._(t`SOCIAL`)}
            </Label>
          </span>
        )}
      </TdBreakWord>
      <Td dataLabel={i18n._(t`First Name`)}>{user.first_name}</Td>
      <Td dataLabel={i18n._(t`Last Name`)}>{user.last_name}</Td>
      <Td dataLabel={i18n._(t`Role`)}>{user_type}</Td>
      <ActionsTd dataLabel={i18n._(t`Actions`)}>
        <ActionItem
          visible={user.summary_fields.user_capabilities.edit}
          tooltip={i18n._(t`Edit User`)}
        >
          <Button
            ouiaId={`${user.id}-edit-button`}
            aria-label={i18n._(t`Edit User`)}
            variant="plain"
            component={Link}
            to={`/users/${user.id}/edit`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

UserListItem.prototype = {
  user: User.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default UserListItem;
