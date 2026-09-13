import type { AnyJob } from 'types/api';
import React, { useEffect, useState, useRef } from 'react';
import { calculateElapsed, secondsToHHMMSS } from 'util/dates';
import {
  CopyIcon,
  DownloadIcon,
  RocketIcon,
  TrashAltIcon,
} from '@patternfly/react-icons';
import { Badge as PFBadge, Button, Tooltip } from '@patternfly/react-core';
import DeleteButton from 'components/DeleteButton';
import { LaunchButton, ReLaunchDropDown } from 'components/LaunchButton';
import { useConfig } from 'contexts/Config';
import { useLingui } from '@lingui/react/macro';

import JobCancelButton from 'components/JobCancelButton';
import './OutputToolbar.css';

const OUTPUT_NO_COUNT_JOB_TYPES = [
  'ad_hoc_command',
  'system_job',
  'inventory_update',
];

export interface OutputToolbarProps {
  job: AnyJob;
  onDelete: () => void;
  isDeleteDisabled?: boolean;
  jobStatus: string;
  [key: string]: unknown;
}

const OutputToolbar = ({
  job,
  onDelete,
  isDeleteDisabled = false,
  jobStatus,
}: OutputToolbarProps) => {
  const { t } = useLingui();
  const [activeJobElapsedTime, setActiveJobElapsedTime] = useState('00:00:00');
  const [copyTooltip, setCopyTooltip] = useState<string | null>(null);
  const hideCounts = OUTPUT_NO_COUNT_JOB_TYPES.includes(job.type);

  const playCount = job?.playbook_counts?.play_count ?? 0;
  const taskCount = job?.playbook_counts?.task_count ?? 0;
  const hostStatusCounts = job?.host_status_counts;
  const darkCount = hostStatusCounts?.dark ?? 0;
  const failureCount = hostStatusCounts?.failures ?? 0;
  const totalHostCount = hostStatusCounts
    ? Object.values(hostStatusCounts).reduce((sum, count) => sum + count, 0)
    : 0;
  const { me } = useConfig();

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    let secTimer: ReturnType<typeof setInterval>;
    if (job.finished) {
      return () => {
        isMounted.current = false;
        clearInterval(secTimer);
      };
    }

    secTimer = setInterval(() => {
      if (!isMounted.current) return;
      const elapsedTime = calculateElapsed(job.started);
      setActiveJobElapsedTime(elapsedTime);
    }, 1000);

    return () => {
      isMounted.current = false;
      clearInterval(secTimer);
    };
  }, [job.started, job.finished]);

  return (
    <div className="awx-output-toolbar__wrapper">
      {!hideCounts && (
        <>
          {playCount > 0 && (
            <div
              className="awx-output-toolbar__badge-group"
              aria-label={t`Play Count`}
            >
              <div>{t`Plays`}</div>
              <PFBadge className="awx-output-toolbar__badge" isRead>
                {playCount}
              </PFBadge>
            </div>
          )}
          {taskCount > 0 && (
            <div
              className="awx-output-toolbar__badge-group"
              aria-label={t`Task Count`}
            >
              <div>{t`Tasks`}</div>
              <PFBadge className="awx-output-toolbar__badge" isRead>
                {taskCount}
              </PFBadge>
            </div>
          )}
          {totalHostCount > 0 && (
            <div
              className="awx-output-toolbar__badge-group"
              aria-label={t`Host Count`}
            >
              <div>{t`Hosts`}</div>
              <PFBadge className="awx-output-toolbar__badge" isRead>
                {totalHostCount}
              </PFBadge>
            </div>
          )}
          {darkCount > 0 && (
            <div
              className="awx-output-toolbar__badge-group"
              aria-label={t`Unreachable Host Count`}
            >
              <div>{t`Unreachable`}</div>
              <Tooltip content={t`Unreachable Hosts`}>
                <PFBadge className="awx-output-toolbar__badge" isRead>
                  {darkCount}
                </PFBadge>
              </Tooltip>
            </div>
          )}
          {failureCount > 0 && (
            <div
              className="awx-output-toolbar__badge-group"
              aria-label={t`Failed Host Count`}
            >
              <div>{t`Failed`}</div>
              <Tooltip content={t`Failed Hosts`}>
                <PFBadge className="awx-output-toolbar__badge" isRead>
                  {failureCount}
                </PFBadge>
              </Tooltip>
            </div>
          )}
        </>
      )}

      <div
        className="awx-output-toolbar__badge-group"
        aria-label={t`Elapsed Time`}
      >
        <div>{t`Elapsed`}</div>
        <Tooltip content={t`Elapsed time that the job ran`}>
          <PFBadge
            className="awx-output-toolbar__badge awx-output-toolbar__elapsed-badge"
            isRead
          >
            {job.finished && job.elapsed != null
              ? secondsToHHMMSS(Number(job.elapsed))
              : activeJobElapsedTime}
          </PFBadge>
        </Tooltip>
      </div>
      {['pending', 'waiting', 'running'].includes(jobStatus) &&
        (job.type === 'system_job'
          ? me?.is_superuser
          : job?.summary_fields?.user_capabilities?.start) && (
          <JobCancelButton
            job={job}
            errorTitle={t`Job Cancel Error`}
            title={t`Cancel ${job.name}`}
            errorMessage={t`Failed to cancel ${job.name}`}
            showIconButton
          />
        )}
      {job.summary_fields?.user_capabilities?.start && (
        <Tooltip
          content={
            job.status === 'failed' && job.type === 'job'
              ? t`Relaunch using host parameters`
              : t`Relaunch Job`
          }
        >
          {job.status === 'failed' && job.type === 'job' ? (
            <LaunchButton resource={job}>
              {({ handleRelaunch, isLaunching }) => (
                <ReLaunchDropDown
                  handleRelaunch={handleRelaunch}
                  ouiaId="job-output-relaunch-dropdown"
                  isLaunching={isLaunching}
                />
              )}
            </LaunchButton>
          ) : (
            <LaunchButton resource={job}>
              {({ handleRelaunch, isLaunching }) => (
                <Button
                  icon={<RocketIcon />}
                  ouiaId="job-output-relaunch-button"
                  variant="plain"
                  onClick={() => handleRelaunch()}
                  aria-label={t`Relaunch`}
                  isDisabled={isLaunching}
                />
              )}
            </LaunchButton>
          )}
        </Tooltip>
      )}

      {job.related?.stdout &&
        ['successful', 'failed', 'error', 'canceled'].includes(jobStatus) && (
          <Tooltip content={copyTooltip || t`Copy Output`}>
            <Button
              icon={<CopyIcon />}
              ouiaId="job-output-copy-button"
              variant="plain"
              aria-label={t`Copy Output`}
              onClick={async () => {
                const res = await fetch(`${job.related?.stdout}?format=txt`);
                const text = await res.text();
                await navigator.clipboard.writeText(text);
                setCopyTooltip(t`Copied`);
                setTimeout(() => setCopyTooltip(null), 2000);
              }}
            />
          </Tooltip>
        )}
      {job.related?.stdout && (
        <Tooltip content={t`Download Output`}>
          <a href={`${job.related.stdout}?format=txt_download`}>
            <Button
              icon={<DownloadIcon />}
              ouiaId="job-output-download-button"
              variant="plain"
              aria-label={t`Download Output`}
            />
          </a>
        </Tooltip>
      )}
      {job.summary_fields?.user_capabilities?.delete &&
        ['new', 'successful', 'failed', 'error', 'canceled'].includes(
          jobStatus
        ) && (
          <Tooltip content={t`Delete Job`}>
            <DeleteButton
              ouiaId="job-output-delete-button"
              name={job.name}
              modalTitle={t`Delete Job`}
              onConfirm={onDelete}
              variant="plain"
              isDisabled={isDeleteDisabled}
            >
              <TrashAltIcon />
            </DeleteButton>
          </Tooltip>
        )}
    </div>
  );
};

export default OutputToolbar;
