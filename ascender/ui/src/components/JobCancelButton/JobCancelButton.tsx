import type { AnyJob, DetailedError } from 'types/api';
import React, { useCallback, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { MinusCircleIcon } from '@patternfly/react-icons';
import { Button } from '@patternfly/react-core';
import { getJobModel, getRunActionLabels } from 'util/jobs';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';
import Tooltip from '../Tooltip';

export interface JobCancelButtonProps {
  errorTitle?: React.ReactNode;
  title: string;
  showIconButton?: boolean;
  errorMessage?: React.ReactNode;
  buttonText?: React.ReactNode;
  style?: React.CSSProperties;
  job?: Partial<AnyJob>;
  isDisabled?: boolean;
  tooltip?: React.ReactNode;
  cancelationMessage?: React.ReactNode;
  /** Told after a workflow's cancel, so the visualiser can re-read it. */
  onCancelWorkflow?: () => void;
  [key: string]: unknown;
}

function JobCancelButton({
  errorTitle,
  title,
  showIconButton,
  errorMessage,
  buttonText,
  style = {},
  job = {},
  isDisabled,
  tooltip,
  cancelationMessage,
  onCancelWorkflow,
}: JobCancelButtonProps) {
  const { t, i18n } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  // The wording names the kind of run, as Relaunch and Delete do, so a
  // project sync is never offered as a job. A caller's own text still wins.
  const actionLabels = getRunActionLabels(job.type);
  const resolvedErrorTitle = errorTitle ?? i18n._(actionLabels.cancelError);
  const { error: cancelError, request: cancelJob } = useRequest(
    useCallback(async () => {
      setIsOpen(false);
      await getJobModel(job.type).cancel(job.id as number);

      if (onCancelWorkflow) {
        onCancelWorkflow();
      }
    }, [job.id, job.type, onCancelWorkflow])
  );
  const { error, dismissError: dismissCancelError } =
    useDismissableError(cancelError);

  const isAlreadyCancelled =
    (cancelError as DetailedError)?.response?.status === 405;
  const renderTooltip = () => {
    if (tooltip) {
      return tooltip;
    }
    return isAlreadyCancelled ? null : title;
  };
  return (
    <>
      <Tooltip content={renderTooltip()}>
        <div>
          {showIconButton ? (
            <Button
              icon={<MinusCircleIcon />}
              isDisabled={isDisabled || isAlreadyCancelled}
              aria-label={title}
              ouiaId="cancel-job-button"
              onClick={() => setIsOpen(true)}
              variant="plain"
              style={style}
            />
          ) : (
            <Button
              isDisabled={isDisabled || isAlreadyCancelled}
              aria-label={title}
              variant="secondary"
              ouiaId="cancel-job-button"
              onClick={() => setIsOpen(true)}
              style={style}
            >
              {buttonText || i18n._(actionLabels.cancel)}
            </Button>
          )}
        </div>
      </Tooltip>
      {isOpen && (
        <AlertModal
          isOpen={isOpen}
          variant="danger"
          onClose={() => setIsOpen(false)}
          title={title}
          label={title}
          actions={[
            <Button
              id="cancel-job-confirm-button"
              key="delete"
              variant="danger"
              aria-label={t`Confirm Cancellation`}
              ouiaId="cancel-job-confirm-button"
              onClick={cancelJob}
            >
              {t`Confirm Cancellation`}
            </Button>,
            <Button
              id="cancel-job-return-button"
              key="cancel"
              ouiaId="return"
              aria-label={t`Return`}
              variant="secondary"
              onClick={() => setIsOpen(false)}
            >
              {t`Return`}
            </Button>,
          ]}
        >
          {cancelationMessage ?? i18n._(actionLabels.cancelConfirm)}
        </AlertModal>
      )}
      {error && !isAlreadyCancelled && (
        <AlertModal
          isOpen={error}
          variant="danger"
          onClose={dismissCancelError}
          title={resolvedErrorTitle}
          label={String(resolvedErrorTitle)}
        >
          {errorMessage}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default JobCancelButton;
