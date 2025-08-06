import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Tr, Td } from '@patternfly/react-table';
import { toTitleCase } from 'util/strings';
import { formatDateString } from 'util/dates';

function UserTokenListItem({ token, isSelected, onSelect, rowIndex }) {
  const { i18n } = useLingui();
  const { id } = useParams();
  return (
    <Tr id={`token-row-${token.id}`} ouiaId={`token-row-${token.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(t`Selected`)}
        id={`token-${token.id}`}
      />
      <Td dataLabel={i18n._(t`Name`)} id={`token-name-${token.id}`}>
        <Link to={`/users/${id}/tokens/${token.id}/details`}>
          {token.summary_fields?.application
            ? token.summary_fields.application.name
            : i18n._(t`Personal access token`)}
        </Link>
      </Td>
      <Td
        dataLabel={i18n._(t`Description`)}
        id={`token-description-${token.id}`}
      >
        {toTitleCase(token.description)}
      </Td>
      <Td dataLabel={i18n._(t`Scope`)} id={`token-scope-${token.id}`}>
        {toTitleCase(token.scope)}
      </Td>
      <Td dataLabel={i18n._(t`Expires`)} id={`token-expires-${token.id}`}>
        {formatDateString(token.expires)}
      </Td>
    </Tr>
  );
}

export default UserTokenListItem;
