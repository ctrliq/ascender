import 'styled-components/macro';
import React from 'react';
import { string, bool, func } from 'prop-types';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { Host } from 'types';
import HostToggle from 'components/HostToggle';
import Sparkline from 'components/Sparkline';

function HostListItem({ host, isSelected, onSelect, detailUrl, rowIndex }) {
  const { i18n } = useLingui();
  const labelId = `check-action-${host.id}`;

  const {
    summary_fields: { recent_jobs: recentJobs = [] },
  } = host;

  return (
    <Tr id={`host-row-${host.id}`} ouiaId={`host-row-${host.id}`}>
      <Td
        data-cy={labelId}
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(msg`Selected`)}
      />
      <TdBreakWord id={labelId} dataLabel={i18n._(msg`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{host.name}</b>
        </Link>
      </TdBreakWord>
      <Td>
        {recentJobs.length > 0 ? (
          <Sparkline jobs={recentJobs} />
        ) : (
          i18n._(msg`No job data available`)
        )}
      </Td>
      <TdBreakWord
        id={`host-description-${host.id}}`}
        dataLabel={i18n._(msg`Description`)}
      >
        {host.description}
      </TdBreakWord>
      <TdBreakWord dataLabel={i18n._(msg`Inventory`)}>
        {host.summary_fields.inventory && (
          <Link
            to={`/inventories/inventory/${host.summary_fields.inventory.id}/details`}
          >
            {host.summary_fields.inventory.name}
          </Link>
        )}
      </TdBreakWord>
      <ActionsTd dataLabel={i18n._(msg`Actions`)} gridColumns="auto 40px">
        <HostToggle host={host} />
        <ActionItem
          visible={host.summary_fields.user_capabilities.edit}
          tooltip={i18n._(msg`Edit Host`)}
        >
          <Button
            ouiaId={`${host.id}-edit-button}`}
            aria-label={i18n._(msg`Edit Host`)}
            variant="plain"
            component={Link}
            to={`/hosts/${host.id}/edit`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

HostListItem.propTypes = {
  host: Host.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default HostListItem;
