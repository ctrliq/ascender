import 'styled-components/macro';
import React, { useState, useEffect, useCallback } from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Switch, Tooltip } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import { HostsAPI } from 'api';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';

function HostToggle({
  className,
  host,
  isDisabled = false,
  onToggle,
  tooltip,
}) {
  const { i18n } = useLingui();
  if (!tooltip) {
    tooltip =
      i18n._(msg`Indicates if a host is available and should be included in running
    jobs.  For hosts that are part of an external inventory, this may be
    reset by the inventory sync process.`);
  }
  const [isEnabled, setIsEnabled] = useState(host.enabled);
  const [showError, setShowError] = useState(false);

  const {
    result,
    isLoading,
    error,
    request: toggleHost,
  } = useRequest(
    useCallback(async () => {
      await HostsAPI.update(host.id, {
        enabled: !isEnabled,
      });
      return !isEnabled;
    }, [host, isEnabled]),
    host.enabled
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
      <Tooltip content={tooltip} position="top">
        <Switch
          className={className}
          css="display: inline-flex;"
          id={`host-${host.id}-toggle`}
          label={i18n._(msg`On`)}
          labelOff={i18n._(msg`Off`)}
          isChecked={isEnabled}
          isDisabled={
            isLoading ||
            isDisabled ||
            !host.summary_fields.user_capabilities.edit
          }
          onChange={toggleHost}
          ouiaId={`host-${host.id}-toggle`}
          aria-label={i18n._(msg`Toggle host`)}
        />
      </Tooltip>
      {showError && error && !isLoading && (
        <AlertModal
          variant="error"
          title={i18n._(msg`Error!`)}
          isOpen={error && !isLoading}
          onClose={() => setShowError(false)}
        >
          {i18n._(msg`Failed to toggle host.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default HostToggle;
