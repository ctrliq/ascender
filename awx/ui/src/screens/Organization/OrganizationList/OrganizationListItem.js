import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router';
import {
  PencilAltIcon,
} from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';

function OrganizationListItem({
  organization,
  isSelected,
  onSelect,
  rowIndex,
  detailUrl,
}) {
  const { t } = useLingui();
  const labelId = `check-action-${organization.id}`;

  return (
    <Tr id={`org-row-${organization.id}`} ouiaId={`org-row-${organization.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
          isDisabled: false,
        }}
        dataLabel={t`Selected`}
      />
      <TdBreakWord id={labelId} dataLabel={t`Name`}>
        <span>
          <Link to={`${detailUrl}`}>
            <b>{organization.name}</b>
          </Link>
        </span>
      </TdBreakWord>
      <Td dataLabel={t`Members`}>
        {organization.summary_fields.related_field_counts.users}
      </Td>
      <Td dataLabel={t`Teams`}>
        {organization.summary_fields.related_field_counts.teams}
      </Td>
      <ActionsTd dataLabel={t`Actions`}>
        <ActionItem
          visible={organization.summary_fields.user_capabilities.edit}
          tooltip={t`Edit Organization`}
        >
          <Button icon={<PencilAltIcon />}
            ouiaId={`${organization.id}-edit-button`}
            aria-label={t`Edit Organization`}
            variant="plain"
            component={Link}
            to={`/organizations/${organization.id}/edit`}
           />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

export default OrganizationListItem;
