import type { SystemJobTemplate } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button, DropdownItem } from '@patternfly/react-core';
import { useKebabifiedMenu } from 'contexts/Kebabified';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import Tooltip from 'components/Tooltip';
import LaunchDaysPrompt, {
  keepsHistory,
} from 'components/JobList/LaunchDaysPrompt';
import launchCleanupJob, { launchRefusalReason } from '../launchCleanupJob';

export interface ManagementJobRunButtonProps {
  /** What is ticked, which is what a click runs. */
  jobs: SystemJobTemplate[];
  /** Forgets the ticks once their runs have started. */
  onLaunched: () => void;
}

/**
 * The toolbar button that runs the cleanup jobs a list has ticked.
 *
 * The same four jobs the run menu offers on the runs screen, started the same
 * way: one run each, and one question about days for the two that keep
 * history, asked once for however many of them were ticked.
 *
 * Nothing ticked is nothing to run rather than all four: a cleanup deletes
 * records, so which ones run is said rather than assumed.
 */
function ManagementJobRunButton({
  jobs,
  onLaunched,
}: ManagementJobRunButtonProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { isKebabified } = useKebabifiedMenu();
  const [isLaunching, setIsLaunching] = useState(false);
  const [daysFor, setDaysFor] = useState<SystemJobTemplate[] | null>(null);
  const [message, setMessage] = useState<React.ReactNode>(null);
  const [error, setError] = useState<unknown>(null);

  const label = t`Run`;
  const isDisabled = jobs.length === 0 || isLaunching;
  const tooltip = jobs.length ? t`Run Selected` : t`Select Cleanup Jobs to Run`;

  const startAll = async (ticked: SystemJobTemplate[], days?: number) => {
    setIsLaunching(true);
    try {
      /* All of them at once, and the answers come back in the order they were
         asked for, so a refusal still names the job it belongs to. The
         launch sends the days only to the jobs that keep history. */
      const answers = await Promise.allSettled(
        ticked.map((job) => launchCleanupJob(job, days))
      );
      /* Each refusal with the api's reason for it: a name alone left the
         reader to guess whether the job was busy, gone, or not theirs. */
      const refused = ticked.flatMap((job, index) => {
        const answer = answers[index];
        return answer?.status === 'rejected'
          ? [
              {
                id: job.id,
                name: String(job.name ?? ''),
                reason: launchRefusalReason(answer.reason),
              },
            ]
          : [];
      });
      const started = answers.flatMap((answer) =>
        answer.status === 'fulfilled' ? [answer.value] : []
      );

      if (refused.length) {
        setMessage(
          <>
            {t`Not started:`}
            <ul>
              {refused.map(({ id, name, reason }) => (
                <li key={id}>{reason ? `${name}: ${reason}` : name}</li>
              ))}
            </ul>
          </>
        );
      }
      if (!started.length) {
        return;
      }
      onLaunched();
      /* One run and nothing left behind is its own answer; anything else is
         watched on the runs list, where all of them are. */
      if (started.length === 1 && !refused.length) {
        navigate(`/runs/management/${started[0] as number}/output`);
      } else if (!refused.length) {
        navigate('/runs');
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleClick = async () => {
    /* Where any ticked job wants a number of days, the prompt asks once and
       the number goes to each of them: it is the same question about the same
       run, asked twice over otherwise. */
    if (jobs.some(keepsHistory)) {
      setDaysFor(jobs);
      return;
    }
    await startAll(jobs);
  };

  return (
    <>
      {isKebabified ? (
        <DropdownItem
          key="run"
          component="button"
          isDisabled={isDisabled}
          ouiaId="management-job-run-dropdown-item"
          onClick={handleClick}
        >
          {label}
        </DropdownItem>
      ) : (
        <Tooltip content={tooltip} position="top">
          <div>
            <Button
              ouiaId="management-job-run-button"
              variant="secondary"
              aria-label={label}
              isDisabled={isDisabled}
              onClick={handleClick}
            >
              {label}
            </Button>
          </div>
        </Tooltip>
      )}

      {daysFor && (
        <LaunchDaysPrompt
          jobCount={daysFor.length}
          onClose={() => setDaysFor(null)}
          onConfirm={async (days) => {
            const ticked = daysFor;
            setDaysFor(null);
            await startAll(ticked, days);
          }}
        />
      )}

      {Boolean(message) && (
        <AlertModal
          isOpen
          variant="info"
          title={t`Run Cleanup Job`}
          onClose={() => setMessage(null)}
        >
          {message}
        </AlertModal>
      )}

      {Boolean(error) && (
        <AlertModal
          isOpen
          variant="error"
          title={t`Error!`}
          onClose={() => setError(null)}
        >
          {t`Failed to run cleanup job.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default ManagementJobRunButton;
