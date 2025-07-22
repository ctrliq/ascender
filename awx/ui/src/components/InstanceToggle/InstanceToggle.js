import React, { useState, useEffect, useCallback } from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Switch, Tooltip } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import { InstancesAPI } from 'api';
import { useConfig } from 'contexts/Config';
import ErrorDetail from '../ErrorDetail';
import AlertModal from '../AlertModal';

function InstanceToggle({ className, fetchInstances, instance, onToggle }) {
  const { i18n } = useLingui();
  const { me = {} } = useConfig();
  const [isEnabled, setIsEnabled] = useState(instance.enabled);
  const [showError, setShowError] = useState(false);

  const {
    result,
    isLoading,
    error,
    request: toggleInstance,
  } = useRequest(
    useCallback(async () => {
      await InstancesAPI.update(instance.id, { enabled: !isEnabled });
      await fetchInstances();
      return !isEnabled;
    }, [instance, isEnabled, fetchInstances]),
    instance.enabled
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
        content={i18n._(
          msg`Set the instance enabled or disabled. If disabled, jobs will not be assigned to this instance.`
        )}
        position="top"
      >
        <Switch
          className={className}
          css="display: inline-flex;"
          id={`host-${instance.id}-toggle`}
          label={i18n._(msg`Enabled`)}
          labelOff={i18n._(msg`Disabled`)}
          isChecked={isEnabled}
          isDisabled={isLoading || !me?.is_superuser}
          onChange={toggleInstance}
          ouiaId={`host-${instance.id}-toggle`}
          aria-label={i18n._(msg`Toggle instance`)}
        />
      </Tooltip>
      {showError && error && !isLoading && (
        <AlertModal
          variant="error"
          title={i18n._(msg`Error!`)}
          isOpen={error && !isLoading}
          onClose={() => setShowError(false)}
        >
          {i18n._(msg`Failed to toggle instance.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default InstanceToggle;
