import React from 'react';
import { string, bool, func, number } from 'prop-types';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { Tr, Td } from '@patternfly/react-table';

import { Token } from 'types';
import { formatDateString } from 'util/dates';
import { toTitleCase } from 'util/strings';

function ApplicationTokenListItem({
  token,
  isSelected,
  onSelect,
  detailUrl,
  rowIndex,
}) {
  const { i18n } = useLingui();
  return (
    <Tr id={`token-row-${token.id}`} ouiaId={`token-row-${token.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(t`Selected`)}
      />
      <Td dataLabel={i18n._(t`Name`)}>
        <Link to={detailUrl}>
          <b>{token.summary_fields.user.username}</b>
        </Link>
      </Td>
      <Td dataLabel={i18n._(t`Scope`)}>{toTitleCase(token.scope)}</Td>
      <Td dataLabel={i18n._(t`Expires`)}>
        {formatDateString(token.expires)}
      </Td>
    </Tr>
  );
}

ApplicationTokenListItem.propTypes = {
  token: Token.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
  rowIndex: number.isRequired,
};

export default ApplicationTokenListItem;
