import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { DateTime, Duration } from 'luxon';
import { msg } from '@lingui/macro';
import { bool, shape, func } from 'prop-types';
import {
  DownloadIcon,
  RocketIcon,
  TrashAltIcon,
} from '@patternfly/react-icons';
import { Badge as PFBadge, Button, Tooltip } from '@patternfly/react-core';
import DeleteButton from 'components/DeleteButton';
import { LaunchButton, ReLaunchDropDown } from 'components/LaunchButton';
import { useConfig } from 'contexts/Config';
import { useLingui } from '@lingui/react';

import JobCancelButton from 'components/JobCancelButton';

const BadgeGroup = styled.div`
  margin-left: 20px;
  height: 18px;
  display: inline-flex;
`;

const Badge = styled(PFBadge)`
  align-items: center;
  display: flex;
  justify-content: center;
  margin-left: 10px;
  ${(props) =>
    props.color
      ? `
  background-color: ${props.color}
  color: white;
  `
      : null}
`;

const Wrapper = styled.div`
  align-items: center;
  display: flex;
  flex-flow: row wrap;
  font-size: 14px;
`;
const calculateElapsed = (started) => {
  const now = DateTime.now();
  const duration = now
    .diff(DateTime.fromISO(`${started}`), [
      'milliseconds',
      'seconds',
      'minutes',
      'hours',
    ])
    .toObject();

  return Duration.fromObject({ ...duration }).toFormat('hh:mm:ss');
};

const OUTPUT_NO_COUNT_JOB_TYPES = [
  'ad_hoc_command',
  'system_job',
  'inventory_update',
];

const OutputToolbar = ({ job, onDelete, isDeleteDisabled, jobStatus }) => {
  const { i18n } = useLingui();
  const [activeJobElapsedTime, setActiveJobElapsedTime] = useState('00:00:00');
  const hideCounts = OUTPUT_NO_COUNT_JOB_TYPES.includes(job.type);

  const playCount = job?.playbook_counts?.play_count;
  const taskCount = job?.playbook_counts?.task_count;
  const darkCount = job?.host_status_counts?.dark;
  const failureCount = job?.host_status_counts?.failures;
  const totalHostCount = job?.host_status_counts
    ? Object.keys(job.host_status_counts || {}).reduce(
        (sum, key) => sum + job.host_status_counts[key],
        0
      )
    : 0;
  const { me } = useConfig();

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    let secTimer;
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
    <Wrapper>
      {!hideCounts && (
        <>
          {playCount > 0 && (
            <BadgeGroup aria-label={i18n._(msg`Play Count`)}>
              <div>{i18n._(msg`Plays`)}</div>
              <Badge isRead>{playCount}</Badge>
            </BadgeGroup>
          )}
          {taskCount > 0 && (
            <BadgeGroup aria-label={i18n._(msg`Task Count`)}>
              <div>{i18n._(msg`Tasks`)}</div>
              <Badge isRead>{taskCount}</Badge>
            </BadgeGroup>
          )}
          {totalHostCount > 0 && (
            <BadgeGroup aria-label={i18n._(msg`Host Count`)}>
              <div>{i18n._(msg`Hosts`)}</div>
              <Badge isRead>{totalHostCount}</Badge>
            </BadgeGroup>
          )}
          {darkCount > 0 && (
            <BadgeGroup aria-label={i18n._(msg`Unreachable Host Count`)}>
              <div>{i18n._(msg`Unreachable`)}</div>
              <Tooltip content={i18n._(msg`Unreachable Hosts`)}>
                <Badge color="#470000" isRead>
                  {darkCount}
                </Badge>
              </Tooltip>
            </BadgeGroup>
          )}
          {failureCount > 0 && (
            <BadgeGroup aria-label={i18n._(msg`Failed Host Count`)}>
              <div>{i18n._(msg`Failed`)}</div>
              <Tooltip content={i18n._(msg`Failed Hosts`)}>
                <Badge color="#C9190B" isRead>
                  {failureCount}
                </Badge>
              </Tooltip>
            </BadgeGroup>
          )}
        </>
      )}

      <BadgeGroup aria-label={i18n._(msg`Elapsed Time`)}>
        <div>{i18n._(msg`Elapsed`)}</div>
        <Tooltip content={i18n._(msg`Elapsed time that the job ran`)}>
          <Badge isRead>
            {job.finished
              ? Duration.fromObject({ seconds: job.elapsed }).toFormat(
                  'hh:mm:ss'
                )
              : activeJobElapsedTime}
          </Badge>
        </Tooltip>
      </BadgeGroup>
      {['pending', 'waiting', 'running'].includes(jobStatus) &&
        (job.type === 'system_job'
          ? me.is_superuser
          : job?.summary_fields?.user_capabilities?.start) && (
          <JobCancelButton
            job={job}
            errorTitle={i18n._(msg`Job Cancel Error`)}
            title={i18n._(msg`Cancel ${job.name}`)}
            errorMessage={i18n._(msg`Failed to cancel ${job.name}`)}
            showIconButton
          />
        )}
      {job.summary_fields.user_capabilities?.start && (
        <Tooltip
          content={
            job.status === 'failed' && job.type === 'job'
              ? i18n._(msg`Relaunch using host parameters`)
              : i18n._(msg`Relaunch Job`)
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
                  ouiaId="job-output-relaunch-button"
                  variant="plain"
                  onClick={() => handleRelaunch()}
                  aria-label={i18n._(msg`Relaunch`)}
                  isDisabled={isLaunching}
                >
                  <RocketIcon />
                </Button>
              )}
            </LaunchButton>
          )}
        </Tooltip>
      )}

      {job.related?.stdout && (
        <Tooltip content={i18n._(msg`Download Output`)}>
          <a href={`${job.related.stdout}?format=txt_download`}>
            <Button
              ouiaId="job-output-download-button"
              variant="plain"
              aria-label={i18n._(msg`Download Output`)}
            >
              <DownloadIcon />
            </Button>
          </a>
        </Tooltip>
      )}
      {job.summary_fields.user_capabilities.delete &&
        ['new', 'successful', 'failed', 'error', 'canceled'].includes(
          jobStatus
        ) && (
          <Tooltip content={i18n._(msg`Delete Job`)}>
            <DeleteButton
              ouiaId="job-output-delete-button"
              name={job.name}
              modalTitle={i18n._(msg`Delete Job`)}
              onConfirm={onDelete}
              variant="plain"
              isDisabled={isDeleteDisabled}
            >
              <TrashAltIcon />
            </DeleteButton>
          </Tooltip>
        )}
    </Wrapper>
  );
};

OutputToolbar.propTypes = {
  isDeleteDisabled: bool,
  job: shape({}).isRequired,
  onDelete: func.isRequired,
};

OutputToolbar.defaultProps = {
  isDeleteDisabled: false,
};

export default OutputToolbar;
