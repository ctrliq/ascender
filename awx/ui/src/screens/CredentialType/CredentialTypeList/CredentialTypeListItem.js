import React from 'react';
import { string, bool, func } from 'prop-types';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { LucideIconPencil } from '@ctrliq/quantic-react';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { CredentialType } from 'types';

function CredentialTypeListItem({
  credentialType,
  detailUrl,
  isSelected,
  onSelect,
  rowIndex,
}) {
  const { t } = useLingui();
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
        dataLabel={t`Selected`}
      />
      <TdBreakWord id={labelId} dataLabel={t`Name`}>
        <Link to={`${detailUrl}`}>
          <b>{credentialType.name}</b>
        </Link>
      </TdBreakWord>
      <ActionsTd dataLabel={t`Actions`}>
        <ActionItem
          visible={credentialType.summary_fields.user_capabilities.edit}
          tooltip={t`Edit credential type`}
        >
          <Button
            ouiaId={`${credentialType.id}-edit-button`}
            aria-label={t`Edit credential type`}
            variant="plain"
            component={Link}
            to={`/credential_types/${credentialType.id}/edit`}
          >
            <LucideIconPencil data-original-icon="PencilAltIcon" size="sm" />
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
