import type { InventorySource, UnifiedJob } from 'types/api';
import React from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';

import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import { formatDateString } from 'util/dates';
import { getRunActionLabels, isJobCancelable, isJobRunning } from 'util/jobs';
import useCanCancelSync from 'hooks/useCanCancelSync';
import Tooltip from 'components/Tooltip';
import InventorySourceSyncButton from '../shared/InventorySourceSyncButton';

export interface InventorySourceListItemProps {
  source: InventorySource;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  detailUrl: string;
  label: React.ReactNode;
  rowIndex: number;
  [key: string]: unknown;
}

function InventorySourceListItem({
  source,
  isSelected,
  onSelect,
  detailUrl,
  label,
  rowIndex,
}: InventorySourceListItemProps) {
  const { t, i18n } = useLingui();
  const generateLastJobTooltip = (job: UnifiedJob) => (
    <>
      <div>{t`MOST RECENT SYNC`}</div>
      <div>
        {t`JOB ID:`} {job.id}
      </div>
      <div>
        {t`STATUS:`} {job.status.toUpperCase()}
      </div>
      {job.finished && (
        <div>
          {t`FINISHED:`} {formatDateString(job.finished)}
        </div>
      )}
    </>
  );

  let job = null;

  if (source.summary_fields?.current_job) {
    job = source.summary_fields.current_job;
  } else if (source.summary_fields?.last_job) {
    job = source.summary_fields.last_job;
  }
  const canCancelSync = useCanCancelSync(
    'inventory_update',
    job?.id,
    job?.status,
    source.summary_fields?.user_capabilities?.edit
  );

  return (
    <Tr id={`source-row-${source.id}`} ouiaId={`source-row-${source.id}`}>
      <Td
        data-cy={`check-action-${source.id}`}
        select={{
          rowIndex,
          isSelected,
          onSelect,
          isDisabled: isJobRunning(source.status),
        }}
      />
      <TdBreakWord dataLabel={t`Name`}>
        <Link to={`${detailUrl}/details`}>
          <b>{source.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={t`Status`}>
        {job && (
          <Tooltip
            position="top"
            content={generateLastJobTooltip(job as UnifiedJob)}
            key={job.id}
          >
            <Link to={`/runs/inventory/${job.id}`}>
              <StatusLabel status={job.status} />
            </Link>
          </Tooltip>
        )}
      </Td>
      <Td dataLabel={t`Type`}>{label}</Td>
      <ActionsTd dataLabel={t`Actions`}>
        {isJobCancelable(job?.status) ? (
          <ActionItem visible={canCancelSync}>
            {job?.id && (
              <JobCancelButton
                job={{
                  type: 'inventory_update',
                  id: job.id,
                }}
                /* The shared wording for this kind of run, the one the runs
                   list and the run's own page use. */
                title={i18n._(getRunActionLabels('inventory_update').cancel)}
                showIconButton
              />
            )}
          </ActionItem>
        ) : (
          /* The button carries its own Sync Source tooltip, so the item
             adds none of its own. */
          <ActionItem visible={source.summary_fields.user_capabilities?.start}>
            <InventorySourceSyncButton source={source} />
          </ActionItem>
        )}
        <ActionItem
          visible={source.summary_fields.user_capabilities?.edit}
          tooltip={t`Edit Source`}
        >
          <Button
            icon={<PencilAltIcon />}
            ouiaId={`${source.id}-edit-button`}
            aria-label={t`Edit Source`}
            variant="plain"
            component={Link}
            to={`${detailUrl}/edit`}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}
export default InventorySourceListItem;
