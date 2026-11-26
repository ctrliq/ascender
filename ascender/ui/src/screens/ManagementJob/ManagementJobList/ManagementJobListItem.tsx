import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';

import { Link, useNavigate } from 'react-router';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { RocketIcon } from '@patternfly/react-icons';

import { ActionsTd, ActionItem } from 'components/PaginatedTable';
import Tooltip from 'components/Tooltip';
import LaunchDaysPrompt from 'components/JobList/LaunchDaysPrompt';
import launchCleanupJob from '../launchCleanupJob';

export interface ManagementJobListItemProps {
  onLaunchError: (error: unknown) => void;
  /** Where the row sits, which is what the tick box reports itself as. */
  rowIndex: number;
  /** Whether this row is ticked, and the tick itself. Only a superuser sees
      them: running these jobs is the one thing a tick is for here. */
  isSelectable?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  /** True for the cleanup jobs, which ask how many days to keep. */
  isPrompted?: boolean;
  isSuperUser?: boolean;
  id: number;
  jobType?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

function ManagementJobListItem({
  onLaunchError,
  rowIndex,
  isSelectable = false,
  isSelected = false,
  onSelect,
  isPrompted,
  isSuperUser,
  id,
  jobType,
  name,
  description,
}: ManagementJobListItemProps) {
  const { t } = useLingui();
  const detailsUrl = `/cleanup_jobs/${id}`;

  const navigate = useNavigate();
  const [isLaunchLoading, setIsLaunchLoading] = useState(false);
  const [isAskingDays, setIsAskingDays] = useState(false);

  /*
   * One launch for both kinds: the two that keep history are given the days
   * the prompt asked for, the rest nothing. A failure goes to the list, which
   * says so the same way whichever row it came from.
   */
  const launch = async (days?: number) => {
    setIsLaunchLoading(true);
    try {
      const runId = await launchCleanupJob({ id, job_type: jobType }, days);
      navigate(`/runs/management/${runId}/output`);
    } catch (error) {
      onLaunchError(error);
    } finally {
      setIsLaunchLoading(false);
    }
  };

  const rowId = `mgmt-jobs-row-${jobType ? jobType.replace('_', '-') : ''}`;
  return (
    <>
      <Tr id={rowId} ouiaId={rowId}>
        {isSelectable && (
          <Td
            select={{
              rowIndex,
              isSelected,
              onSelect: () => onSelect?.(),
            }}
            dataLabel={t`Selected`}
          />
        )}
        <Td dataLabel={t`Name`}>
          <Link to={`${detailsUrl}`}>
            <b>{name}</b>
          </Link>
        </Td>
        <Td dataLabel={t`Description`}>{description}</Td>
        <ActionsTd dataLabel={t`Actions`}>
          <ActionItem visible={isSuperUser}>
            {isSuperUser ? (
              <Tooltip content={t`Run Cleanup Job`}>
                <Button
                  icon={<RocketIcon />}
                  ouiaId={`${id}-launch-button`}
                  aria-label={t`Run Cleanup Job`}
                  variant="plain"
                  onClick={() =>
                    isPrompted ? setIsAskingDays(true) : launch()
                  }
                  isDisabled={isLaunchLoading}
                />
              </Tooltip>
            ) : null}
          </ActionItem>
        </ActionsTd>
      </Tr>
      {isAskingDays && (
        <LaunchDaysPrompt
          onClose={() => setIsAskingDays(false)}
          onConfirm={(days) => {
            setIsAskingDays(false);
            launch(days);
          }}
        />
      )}
    </>
  );
}

export default ManagementJobListItem;
