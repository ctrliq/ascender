import 'styled-components/macro';
import React, { useState, useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Switch, Tooltip } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import { SchedulesAPI } from 'api';
import AlertModal from '../../AlertModal';
import ErrorDetail from '../../ErrorDetail';

function ScheduleToggle({ schedule, onToggle, className, isDisabled }) {
  const { i18n } = useLingui();
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
        content={
          schedule.enabled
            ? i18n._(msg`Schedule is active`)
            : i18n._(msg`Schedule is inactive`)
        }
        position="top"
      >
        <Switch
          className={className}
          css="display: inline-flex;"
          id={`schedule-${schedule.id}-toggle`}
          label={i18n._(msg`On`)}
          labelOff={i18n._(msg`Off`)}
          isChecked={isEnabled}
          isDisabled={
            isLoading ||
            !schedule.summary_fields.user_capabilities.edit ||
            isDisabled
          }
          onChange={toggleSchedule}
          aria-label={i18n._(msg`Toggle schedule`)}
          ouiaId={`schedule-${schedule.id}-toggle`}
        />
      </Tooltip>
      {showError && error && !isLoading && (
        <AlertModal
          variant="error"
          title={i18n._(msg`Error!`)}
          isOpen={error && !isLoading}
          onClose={() => setShowError(false)}
        >
          {i18n._(msg`Failed to toggle schedule.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default ScheduleToggle;
