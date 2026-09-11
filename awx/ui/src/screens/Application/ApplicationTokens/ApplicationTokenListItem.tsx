import type { OAuth2Token, Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { Tr, Td } from '@patternfly/react-table';

import { formatDateString } from 'util/dates';
import { toTitleCase } from 'util/strings';

export interface ApplicationTokenListItemProps {
  token: OAuth2Token;
  isSelected: boolean;
  onSelect: (item?: Untyped) => void;
  detailUrl: string;
  rowIndex: number;
  [key: string]: unknown;
}

function ApplicationTokenListItem({
  token,
  isSelected,
  onSelect,
  detailUrl,
  rowIndex,
}: ApplicationTokenListItemProps) {
  const { t } = useLingui();
  return (
    <Tr id={`token-row-${token.id}`} ouiaId={`token-row-${token.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={t`Selected`}
      />
      <Td dataLabel={t`Name`}>
        <Link to={detailUrl}>
          <b>{token.summary_fields.user?.username}</b>
        </Link>
      </Td>
      <Td dataLabel={t`Scope`}>{toTitleCase(token.scope)}</Td>
      <Td dataLabel={t`Expires`}>{formatDateString(token.expires)}</Td>
    </Tr>
  );
}

export default ApplicationTokenListItem;
