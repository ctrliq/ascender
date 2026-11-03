import type { Schedule } from 'types/api';
import React, { useState, useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Switch } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import { SchedulesAPI } from 'api';
import AlertModal from '../../AlertModal';
import ErrorDetail from '../../ErrorDetail';
import Tooltip from '../../Tooltip';

export interface ScheduleToggleProps {
  schedule: Schedule;
  /** Told whether the schedule is enabled now, once the api has said so. */
  onToggle?: (isEnabled: boolean) => void;
  className?: string;
  isDisabled?: boolean;
  [key: string]: unknown;
}

function ScheduleToggle({
  schedule,
  onToggle,
  className,
  isDisabled,
}: ScheduleToggleProps) {
  const { t } = useLingui();
  const [isEnabled, setIsEnabled] = useState(schedule.enabled);
  const [showError, setShowError] = useState(false);

  const {
    result,
    isLoading,
    error,
    request: toggleSchedule,
  } = useRequest(
    useCallback(async () => {
      await SchedulesAPI.update(schedule.id, {
        enabled: !isEnabled,
      });
      return !isEnabled;
    }, [schedule, isEnabled]),
    schedule.enabled
  );

  useEffect(() => {
    if (result !== isEnabled) {
      setIsEnabled(result);
      if (onToggle) {
        onToggle(result);
      }
    }
  }, [result, isEnabled, onToggle]);

  useEffect(() => {
    if (error) {
      setShowError(true);
    }
  }, [error]);

  return (
    <>
      <Tooltip
        // The toggle's own state, which moves on after a click while the
        // schedule it was handed still says what it said on load.
        content={isEnabled ? t`Schedule is active` : t`Schedule is inactive`}
        position="top"
      >
        <Switch
          className={className}
          id={`schedule-${schedule.id}-toggle`}
          // PatternFly 6 dropped labelOff, so the label follows the state
          // itself, as the host toggle's does.
          label={isEnabled ? t`On` : t`Off`}
          isChecked={Boolean(isEnabled)}
          isDisabled={
            isLoading ||
            !schedule.summary_fields.user_capabilities?.edit ||
            isDisabled
          }
          onChange={toggleSchedule}
          aria-label={t`Toggle Schedule`}
          ouiaId={`schedule-${schedule.id}-toggle`}
        />
      </Tooltip>
      {showError && error && !isLoading && (
        <AlertModal
          variant="error"
          title={t`Error!`}
          isOpen={error && !isLoading}
          onClose={() => setShowError(false)}
        >
          {t`Failed to toggle schedule.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default ScheduleToggle;
