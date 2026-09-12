import type { Host, SummaryFieldRef, Untyped } from 'types/api';
import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router';
import { PencilAltIcon } from '@patternfly/react-icons';
import { Label, Button } from '@patternfly/react-core';

import { HostsAPI } from 'api';
import AlertModal from 'components/AlertModal';
import ChipGroup from 'components/ChipGroup';
import ErrorDetail from 'components/ErrorDetail';
import HostToggle from 'components/HostToggle';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import Sparkline from 'components/Sparkline';

export interface InventoryHostItemProps {
  detailUrl: string;
  editUrl: Untyped;
  host: Host;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  rowIndex: number;
  [key: string]: unknown;
}

function InventoryHostItem({
  detailUrl,
  editUrl,
  host,
  isSelected,
  onSelect,
  rowIndex,
}: InventoryHostItemProps) {
  const { t } = useLingui();
  const labelId = `check-action-${host.id}`;
  const initialGroups = host?.summary_fields?.groups ?? {
    results: [],
    count: 0,
  };

  const {
    summary_fields: { recent_jobs: recentJobs = [] },
  } = host;

  const {
    error,
    request: fetchRelatedGroups,
    result: relatedGroups,
  } = useRequest(
    // The summary the row was listed with holds only the first few groups;
    // the overflow chip reads the rest.
    useCallback(async (hostId: number): Promise<SummaryFieldRef[]> => {
      const { data } = await HostsAPI.readGroups(hostId);
      return data.results;
    }, []),
    initialGroups.results
  );

  const { error: dismissableError, dismissError } = useDismissableError(error);

  const handleOverflowChipClick = (hostId: number) => {
    if (relatedGroups?.length === initialGroups.count) {
      return;
    }
    fetchRelatedGroups(hostId);
  };

  return (
    <>
      <Tr id={`host-row-${host.id}`} ouiaId={`inventory-host-row-${host.id}`}>
        <Td
          data-cy={labelId}
          select={{
            rowIndex,
            isSelected,
            onSelect,
          }}
        />
        <TdBreakWord id={labelId} dataLabel={t`Name`}>
          <Link to={`${detailUrl}`}>
            <b>{host.name}</b>
          </Link>
        </TdBreakWord>
        <Td>
          {recentJobs.length > 0 ? (
            <Sparkline jobs={recentJobs} />
          ) : (
            t`No job data available`
          )}
        </Td>
        <TdBreakWord
          id={`host-description-${host.id}`}
          dataLabel={t`Description`}
        >
          {host.description}
        </TdBreakWord>
        <TdBreakWord
          id={`host-related-groups-${host.id}`}
          dataLabel={t`Related Groups`}
        >
          <ChipGroup
            aria-label={t`Related Groups`}
            numChips={4}
            totalChips={initialGroups.count ?? 0}
            ouiaId="host-related-groups-chips"
            onOverflowChipClick={() => handleOverflowChipClick(host.id)}
          >
            {(relatedGroups ?? []).map((group) => (
              <Label variant="outline" key={group.name}>
                {group.name}
              </Label>
            ))}
          </ChipGroup>
        </TdBreakWord>
        <ActionsTd
          aria-label={t`Actions`}
          dataLabel={t`Actions`}
          gridColumns="auto 40px"
        >
          <HostToggle host={host} />
          <ActionItem
            visible={host.summary_fields.user_capabilities?.edit}
            tooltip={t`Edit host`}
          >
            <Button
              icon={<PencilAltIcon />}
              aria-label={t`Edit host`}
              ouiaId={`${host.id}-edit-button`}
              variant="plain"
              component={Link}
              to={`${editUrl}`}
            />
          </ActionItem>
        </ActionsTd>
      </Tr>
      {dismissableError && (
        <AlertModal
          isOpen={dismissableError}
          onClose={dismissError}
          title={t`Error!`}
          variant="error"
        >
          {t`Failed to load related groups.`}
          <ErrorDetail error={dismissableError} />
        </AlertModal>
      )}
    </>
  );
}

export default InventoryHostItem;
