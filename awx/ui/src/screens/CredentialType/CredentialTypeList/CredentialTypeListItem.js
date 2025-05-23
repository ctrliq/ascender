import React from 'react';
import { string, bool, func } from 'prop-types';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Link } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { CredentialType } from 'types';

function CredentialTypeListItem({
  credentialType,
  detailUrl,
  isSelected,
  onSelect,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const labelId = `check-action-${credentialType.id}`;

  return (
    <Tr
      id={`credential-type-row-${credentialType.id}`}
      ouiaId={`credential-type-row-${credentialType.id}`}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(msg`Selected`)}
      />
      <TdBreakWord id={labelId} dataLabel={i18n._(msg`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{credentialType.name}</b>
        </Link>
      </TdBreakWord>
      <ActionsTd dataLabel={i18n._(msg`Actions`)}>
        <ActionItem
          visible={credentialType.summary_fields.user_capabilities.edit}
          tooltip={i18n._(msg`Edit credential type`)}
        >
          <Button
            ouiaId={`${credentialType.id}-edit-button`}
            aria-label={i18n._(msg`Edit credential type`)}
            variant="plain"
            component={Link}
            to={`/credential_types/${credentialType.id}/edii18n._(msg`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

CredentialTypeListItem.prototype = {
  credentialType: CredentialType.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default CredentialTypeListItem;
