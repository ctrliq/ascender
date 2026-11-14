import type { SystemJobTemplate } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { useConfig } from 'contexts/Config';
import AlertModal from 'components/AlertModal';
import Tooltip from 'components/Tooltip';
import ErrorDetail from 'components/ErrorDetail';
import LaunchDaysPrompt, {
  keepsHistory,
} from 'components/JobList/LaunchDaysPrompt';
import launchCleanupJob from './launchCleanupJob';

export interface ManagementJobLaunchButtonProps {
  systemJobTemplate: SystemJobTemplate;
  /** Told apart per screen, since the details and the runs tab both carry it. */
  ouiaId?: string;
  /**
   * What the button says and its tooltip. Both default to the words the list's
   * rocket and toolbar use, Run and Run Cleanup Job, so the details and the
   * runs tab call the action what the rest of the screen does.
   */
  label?: string;
  tooltip?: string;
}

/**
 * Launch for one cleanup job, wherever that job is the thing on screen: its
 * details, and its runs tab, where it starts the run the list will show.
 *
 * The same start the list's rocket makes: straight away, or with the number of
 * days to keep for the two jobs that keep history, and then on to the run's
 * output, where a launch from anywhere else lands too. Running a cleanup is a
 * superuser's call, as the rocket on the list is, so nobody else sees it.
 */
function ManagementJobLaunchButton({
  systemJobTemplate,
  ouiaId = 'management-job-launch-button',
  label,
  tooltip,
}: ManagementJobLaunchButtonProps) {
  const { t } = useLingui();
  const buttonLabel = label ?? t`Run`;
  const buttonTooltip = tooltip ?? t`Run Cleanup Job`;
  const navigate = useNavigate();
  const { me } = useConfig();
  const [isLaunching, setIsLaunching] = useState(false);
  const [isAskingDays, setIsAskingDays] = useState(false);
  const [launchError, setLaunchError] = useState<unknown>(null);

  if (!me?.is_superuser) {
    return null;
  }

  const launch = async (days?: number) => {
    setIsLaunching(true);
    try {
      const runId = await launchCleanupJob(systemJobTemplate, days);
      navigate(`/runs/management/${runId}/output`);
    } catch (error) {
      setLaunchError(error);
      setIsLaunching(false);
    }
  };

  const button = (
    <Button
      ouiaId={ouiaId}
      variant="secondary"
      aria-label={buttonLabel}
      isDisabled={isLaunching}
      onClick={() =>
        keepsHistory(systemJobTemplate) ? setIsAskingDays(true) : launch()
      }
    >
      {buttonLabel}
    </Button>
  );

  return (
    <>
      <Tooltip content={buttonTooltip} position="top">
        {button}
      </Tooltip>
      {isAskingDays && (
        <LaunchDaysPrompt
          onClose={() => setIsAskingDays(false)}
          onConfirm={(days) => {
            setIsAskingDays(false);
            launch(days);
          }}
        />
      )}
      {Boolean(launchError) && (
        <AlertModal
          isOpen
          variant="error"
          title={t`Error!`}
          onClose={() => setLaunchError(null)}
        >
          {t`Failed to run cleanup job.`}
          <ErrorDetail error={launchError} />
        </AlertModal>
      )}
    </>
  );
}

export default ManagementJobLaunchButton;
