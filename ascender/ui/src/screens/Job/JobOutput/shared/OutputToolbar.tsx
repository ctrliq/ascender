import type { AnyJob } from 'types/api';
import React, { useEffect, useState, useRef } from 'react';
import { calculateElapsed, secondsToHHMMSS } from 'util/dates';
import {
  CopyIcon,
  DownloadIcon,
  RocketIcon,
  TrashAltIcon,
} from '@patternfly/react-icons';
import { Badge as PFBadge, Button } from '@patternfly/react-core';
import AlertModal from 'components/AlertModal';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import { LaunchButton, ReLaunchDropDown } from 'components/LaunchButton';
import { useLingui } from '@lingui/react/macro';
import { canCancelJob, canDeleteJob, getRunActionLabels } from 'util/jobs';

import JobCancelButton from 'components/JobCancelButton';
import './OutputToolbar.css';
import Tooltip from 'components/Tooltip';
import { SystemJobsAPI } from 'api';

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
  const { t, i18n } = useLingui();
  const actionLabels = getRunActionLabels(job.type);
  // The status the socket keeps current, which the job this toolbar was
  // handed may lag behind.
  const liveJob = { ...job, status: jobStatus };
  const [activeJobElapsedTime, setActiveJobElapsedTime] = useState('00:00:00');
  const [copyTooltip, setCopyTooltip] = useState<string | null>(null);
  /*
   * What went wrong reading or handing over the output, with the title that
   * says which action it was. Copy and download used to await without a
   * catch, so a refused read either said Copied over an error page's text or
   * did nothing at all.
   */
  const [outputError, setOutputError] = useState<{
    title: string;
    error: unknown;
  } | null>(null);
  const hideCounts = OUTPUT_NO_COUNT_JOB_TYPES.includes(job.type);

  const playCount = job?.playbook_counts?.play_count ?? 0;
  const taskCount = job?.playbook_counts?.task_count ?? 0;
  const hostStatusCounts = job?.host_status_counts;
  const darkCount = hostStatusCounts?.dark ?? 0;
  const failureCount = hostStatusCounts?.failures ?? 0;
  const totalHostCount = hostStatusCounts
    ? Object.values(hostStatusCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  /*
   * Every other run type has a stdout endpoint that answers as plain text or
   * as a file. A system job has none, so its output is only on the job itself,
   * in result_stdout: read fresh at the click, since the copy of the job this
   * screen holds can predate the end of the run.
   */
  const isSystemJob = job.type === 'system_job';
  const hasOutputText = Boolean(job.related?.stdout) || isSystemJob;
  const readOutputText = async () => {
    if (isSystemJob) {
      const { data } = await SystemJobsAPI.readDetail(job.id);
      return data.result_stdout ?? '';
    }
    const res = await fetch(`${job.related?.stdout}?format=txt`);
    // fetch only rejects when the request never completes; a refused read
    // resolves too, and its body is the error page rather than the output.
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`.trim());
    }
    return res.text();
  };
  const downloadSystemJobOutput = async () => {
    let text: string;
    try {
      text = await readOutputText();
    } catch (error) {
      setOutputError({ title: t`Could not download the output`, error });
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    // The name the api gives the file for the run types it serves.
    link.download = `system_job_${job.id}.txt`;
    link.click();
    // Released a turn later: Firefox can drop a download whose address is
    // revoked in the same turn as the click.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const copyOutput = async () => {
    try {
      const text = await readOutputText();
      await navigator.clipboard.writeText(text);
    } catch (error) {
      setOutputError({ title: t`Could not copy the output`, error });
      return;
    }
    setCopyTooltip(t`Copied`);
    setTimeout(() => setCopyTooltip(null), 2000);
  };

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
    <div className="ascender-output-toolbar__wrapper">
      {!hideCounts && (
        <>
          {playCount > 0 && (
            <div
              className="ascender-output-toolbar__badge-group"
              aria-label={t`Play Count`}
            >
              <div>{t`Plays`}</div>
              <PFBadge className="ascender-output-toolbar__badge" isRead>
                {playCount}
              </PFBadge>
            </div>
          )}
          {taskCount > 0 && (
            <div
              className="ascender-output-toolbar__badge-group"
              aria-label={t`Task Count`}
            >
              <div>{t`Tasks`}</div>
              <PFBadge className="ascender-output-toolbar__badge" isRead>
                {taskCount}
              </PFBadge>
            </div>
          )}
          {totalHostCount > 0 && (
            <div
              className="ascender-output-toolbar__badge-group"
              aria-label={t`Host Count`}
            >
              <div>{t`Hosts`}</div>
              <PFBadge className="ascender-output-toolbar__badge" isRead>
                {totalHostCount}
              </PFBadge>
            </div>
          )}
          {darkCount > 0 && (
            <div
              className="ascender-output-toolbar__badge-group"
              aria-label={t`Unreachable Host Count`}
            >
              <div>{t`Unreachable`}</div>
              <Tooltip content={t`Unreachable Hosts`}>
                <PFBadge
                  className="ascender-output-toolbar__badge ascender-output-toolbar__badge--unreachable"
                  isRead
                >
                  {darkCount}
                </PFBadge>
              </Tooltip>
            </div>
          )}
          {failureCount > 0 && (
            <div
              className="ascender-output-toolbar__badge-group"
              aria-label={t`Failed Host Count`}
            >
              <div>{t`Failed`}</div>
              <Tooltip content={t`Failed Hosts`}>
                <PFBadge
                  className="ascender-output-toolbar__badge ascender-output-toolbar__badge--failed"
                  isRead
                >
                  {failureCount}
                </PFBadge>
              </Tooltip>
            </div>
          )}
        </>
      )}

      <div
        className="ascender-output-toolbar__badge-group"
        aria-label={t`Elapsed Time`}
      >
        <div>{t`Elapsed`}</div>
        <Tooltip content={t`Elapsed time that the job ran`}>
          <PFBadge
            className="ascender-output-toolbar__badge ascender-output-toolbar__elapsed-badge"
            isRead
          >
            {job.finished && job.elapsed != null
              ? secondsToHHMMSS(Number(job.elapsed))
              : activeJobElapsedTime}
          </PFBadge>
        </Tooltip>
      </div>
      {canCancelJob(liveJob) && (
        <JobCancelButton
          job={job}
          title={i18n._(actionLabels.cancel)}
          errorMessage={t`Failed to cancel ${job.name}`}
          showIconButton
        />
      )}
      {/* A cleanup job has nothing to relaunch from here, so like the
          details page and the list row the toolbar leaves it out. */}
      {job.type !== 'system_job' &&
        job.summary_fields?.user_capabilities?.start && (
          <Tooltip
            content={
              job.status === 'failed' && job.type === 'job'
                ? t`Relaunch Using Host Parameters`
                : i18n._(actionLabels.relaunch)
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

      {hasOutputText &&
        ['successful', 'failed', 'error', 'canceled'].includes(jobStatus) && (
          <Tooltip content={copyTooltip || t`Copy Output`}>
            <Button
              icon={<CopyIcon />}
              ouiaId="job-output-copy-button"
              variant="plain"
              aria-label={t`Copy Output`}
              onClick={copyOutput}
            />
          </Tooltip>
        )}
      {isSystemJob && (
        <Tooltip content={t`Download Output`}>
          <Button
            icon={<DownloadIcon />}
            ouiaId="job-output-download-button"
            variant="plain"
            aria-label={t`Download Output`}
            onClick={downloadSystemJobOutput}
          />
        </Tooltip>
      )}
      {!isSystemJob && job.related?.stdout && (
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
      {canDeleteJob(liveJob) && (
        <Tooltip content={i18n._(actionLabels.delete)}>
          <DeleteButton
            ouiaId="job-output-delete-button"
            name={job.name}
            modalTitle={i18n._(actionLabels.delete)}
            onConfirm={onDelete}
            variant="plain"
            isDisabled={isDeleteDisabled}
          >
            <TrashAltIcon />
          </DeleteButton>
        </Tooltip>
      )}
      {outputError && (
        <AlertModal
          isOpen
          variant="danger"
          title={outputError.title}
          label={outputError.title}
          onClose={() => setOutputError(null)}
        >
          <ErrorDetail error={outputError.error} />
        </AlertModal>
      )}
    </div>
  );
};

export default OutputToolbar;
