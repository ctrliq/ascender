import type { OAuth2Token } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { Tr, Td } from '@patternfly/react-table';

import { formatDateString } from 'util/dates';
import { toTitleCase } from 'util/strings';

export interface ApplicationTokenListItemProps {
  token: OAuth2Token;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  /** The token's details page, or null when the viewer cannot open it. */
  detailUrl: string | null;
  /**
   * Where the details page's Back to Tokens returns to, handed over in the
   * link's state since the page itself sits under the token's owner.
   */
  backTo?: string;
  rowIndex: number;
  [key: string]: unknown;
}

function ApplicationTokenListItem({
  token,
  isSelected,
  onSelect,
  detailUrl,
  backTo,
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
      <Td dataLabel={t`Username`}>
        {detailUrl ? (
          <Link to={detailUrl} state={backTo ? { backTo } : undefined}>
            <b>{token.summary_fields.user?.username}</b>
          </Link>
        ) : (
          <b>{token.summary_fields.user?.username}</b>
        )}
      </Td>
      <Td dataLabel={t`Scope`}>{toTitleCase(token.scope)}</Td>
      <Td dataLabel={t`Expires`} modifier="nowrap">
        {formatDateString(token.expires)}
      </Td>
    </Tr>
  );
}

export default ApplicationTokenListItem;
