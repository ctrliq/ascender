import React from 'react';
import { string, bool, func } from 'prop-types';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { formatDateString } from 'util/dates';
import { Application } from 'types';

function ApplicationListItem({
  application,
  isSelected,
  onSelect,
  detailUrl,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const labelId = `check-action-${application.id}`;
  return (
    <Tr
      id={`application-row-${application.id}`}
      ouiaId={`application-row-${application.id}`}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(t`Selected`)}
      />
      <TdBreakWord id={labelId} dataLabel={i18n._(t`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{application.name}</b>
        </Link>
      </TdBreakWord>
      <TdBreakWord dataLabel={i18n._(t`Organization`)}>
        <Link
          to={`/organizations/${application.summary_fields.organization.id}`}
        >
          <b>{application.summary_fields.organization.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={i18n._(t`Last Modified`)}>
        {formatDateString(application.modified)}
      </Td>
      <ActionsTd dataLabel={i18n._(t`Actions`)}>
        <ActionItem
          visible={application.summary_fields.user_capabilities.edit}
          tooltip={i18n._(t`Edit application`)}
        >
          <Button
            ouiaId={`${application.id}-edit-button`}
            aria-label={i18n._(t`Edit application`)}
            variant="plain"
            component={Link}
            to={`/applications/${application.id}/edit`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

ApplicationListItem.propTypes = {
  application: Application.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default ApplicationListItem;
