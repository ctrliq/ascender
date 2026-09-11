import type { Untyped } from 'types/api';
import React from 'react';
import { Link, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Tr, Td } from '@patternfly/react-table';
import { toTitleCase } from 'util/strings';
import { formatDateString } from 'util/dates';

export interface UserTokenListItemProps {
  token: Untyped;
  isSelected: boolean;
  onSelect: (...args: Untyped[]) => void;
  rowIndex: Untyped;
  [key: string]: unknown;
}

function UserTokenListItem({
  token,
  isSelected,
  onSelect,
  rowIndex,
}: UserTokenListItemProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  return (
    <Tr id={`token-row-${token.id}`} ouiaId={`token-row-${token.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={t`Selected`}
        id={`token-${token.id}`}
      />
      <Td dataLabel={t`Name`} id={`token-name-${token.id}`}>
        <Link to={`/users/${id}/tokens/${token.id}/details`}>
          {token.summary_fields?.application
            ? token.summary_fields.application.name
            : t`Personal access token`}
        </Link>
      </Td>
      <Td dataLabel={t`Description`} id={`token-description-${token.id}`}>
        {toTitleCase(token.description)}
      </Td>
      <Td dataLabel={t`Scope`} id={`token-scope-${token.id}`}>
        {toTitleCase(token.scope)}
      </Td>
      <Td dataLabel={t`Expires`} id={`token-expires-${token.id}`}>
        {formatDateString(token.expires)}
      </Td>
    </Tr>
  );
}

export default UserTokenListItem;
