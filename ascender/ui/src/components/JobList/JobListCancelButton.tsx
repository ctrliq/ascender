import type { UnifiedJob } from 'types/api';
import React, { useContext, useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button, DropdownItem } from '@patternfly/react-core';

import { KebabifiedContext } from 'contexts/Kebabified';
import { canCancelJob, isJobCancelable } from 'util/jobs';
import AlertModal from '../AlertModal';
import Tooltip from '../Tooltip';

/*
 * The same rule as a row's own Cancel, the details page and the output
 * toolbars: the api's cancel capability, which covers the run's creator, an
 * admin of what it ran and a superuser, and a cleanup job for superusers only.
 * The start capability it used to read let an executor who may not cancel
 * pick a cleanup job or someone else's run and be refused.
 */
function cannotCancelBecausePermissions(job: UnifiedJob) {
  return isJobCancelable(job.status) && !canCancelJob(job);
}

function cannotCancelBecauseNotRunning(job: UnifiedJob) {
  return !isJobCancelable(job.status);
}

export interface JobListCancelButtonProps {
  /** The jobs the toolbar has selected, of which the running ones can stop. */
  jobsToCancel?: UnifiedJob[];
  onCancel?: (jobs: UnifiedJob[]) => void;
}

function JobListCancelButton({
  jobsToCancel = [],
  onCancel = () => {},
}: JobListCancelButtonProps) {
  const { t } = useLingui();
  const { isKebabified, onKebabModalChange } = useContext(KebabifiedContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const numJobsToCancel = jobsToCancel.length;

  const handleCancelJob = () => {
    onCancel(jobsToCancel);
    setIsModalOpen(false);
  };

  const toggleModal = () => {
    setIsModalOpen(!isModalOpen);
  };

  useEffect(() => {
    if (isKebabified) {
      onKebabModalChange?.(isModalOpen);
    }
  }, [isKebabified, isModalOpen, onKebabModalChange]);

  const renderTooltip = () => {
    const cannotCancelPermissions = jobsToCancel
      .filter(cannotCancelBecausePermissions)
      .map((job) => job.name);
    const cannotCancelNotRunning = jobsToCancel
      .filter(cannotCancelBecauseNotRunning)
      .map((job) => job.name);
    const numJobsUnableToCancel = cannotCancelPermissions.concat(
      cannotCancelNotRunning
    ).length;
    if (numJobsUnableToCancel > 0) {
      return (
        <div>
          {cannotCancelPermissions.length > 0 && (
            <div>
              {t`You do not have permission to cancel:`}
              {cannotCancelPermissions.map((job, i) => (
                <strong key={job}>
                  {' '}
                  {job}
                  {i !== cannotCancelPermissions.length - 1 ? ',' : ''}
                </strong>
              ))}
            </div>
          )}
          {cannotCancelNotRunning.length > 0 && (
            <div>
              {t`Not running, so nothing to cancel:`}
              {cannotCancelNotRunning.map((job, i) => (
                <strong key={job}>
                  {' '}
                  {job}
                  {i !== cannotCancelNotRunning.length - 1 ? ',' : ''}
                </strong>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (numJobsToCancel > 0) {
      return t`Cancel the selection`;
    }
    return t`Select a row to cancel`;
  };

  const isDisabled =
    jobsToCancel.length === 0 ||
    jobsToCancel.some(cannotCancelBecausePermissions) ||
    jobsToCancel.some(cannotCancelBecauseNotRunning);
  const cancelJobText = t`Cancel`;

  return (
    <>
      {isKebabified ? (
        <DropdownItem
          key="cancel-job"
          isDisabled={isDisabled}
          component="button"
          // Named by its own text: the toolbar button whose id the label
          // used to point at is not rendered while the actions sit in a
          // kebab.
          onClick={toggleModal}
          ouiaId="cancel-job-dropdown-item"
        >
          {cancelJobText}
        </DropdownItem>
      ) : (
        <Tooltip content={renderTooltip()} position="top">
          <div>
            <Button
              id="jobs-list-cancel-button"
              ouiaId="cancel-job-button"
              variant="secondary"
              aria-labelledby="jobs-list-cancel-button"
              onClick={toggleModal}
              isDisabled={isDisabled}
            >
              {cancelJobText}
            </Button>
          </div>
        </Tooltip>
      )}
      {isModalOpen && (
        <AlertModal
          variant="danger"
          title={cancelJobText}
          isOpen={isModalOpen}
          onClose={toggleModal}
          actions={[
            <Button
              ouiaId="cancel-job-confirm-button"
              id="cancel-job-confirm-button"
              key="delete"
              variant="danger"
              onClick={handleCancelJob}
            >
              {t`Confirm Cancellation`}
            </Button>,
            <Button
              ouiaId="cancel-job-return-button"
              id="cancel-job-return-button"
              key="cancel"
              variant="secondary"
              aria-label={t`Return`}
              onClick={toggleModal}
            >
              {t`Return`}
            </Button>,
          ]}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            {t`This action will cancel:`}
          </div>
          {jobsToCancel.map((job) => (
            <span key={job.id}>
              <strong>{job.name}</strong>
              <br />
            </span>
          ))}
        </AlertModal>
      )}
    </>
  );
}

export default JobListCancelButton;
