import type { Host } from 'types/api';
import React, { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useLingui } from '@lingui/react/macro';
import { Switch } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import { HostsAPI } from 'api';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';
import Tooltip from '../Tooltip';

/** The cached lists whose rows are hosts, named by the first element of their key. */
const HOST_LISTS = [
  'host-list',
  'inventory-host-list',
  'inventory-group-host-list',
];

export interface HostToggleProps {
  className?: string;
  host: Host;
  isDisabled?: boolean;
  onToggle?: (isEnabled: boolean) => void;
  tooltip?: React.ReactNode;
  [key: string]: unknown;
}

function HostToggle({
  className,
  host,
  isDisabled = false,
  onToggle,
  tooltip,
}: HostToggleProps) {
  const { t } = useLingui();
  if (!tooltip) {
    tooltip = t`Indicates if a host is available and should be included in running
    jobs.  For hosts that are part of an external inventory, this may be
    reset by the inventory sync process.`;
  }
  const queryClient = useQueryClient();
  const [isEnabled, setIsEnabled] = useState(host.enabled);
  const [showError, setShowError] = useState(false);

  /*
   * The switch keeps its own state so that it answers a click at once, but the
   * host it was handed wins whenever that changes. A list returning from
   * another screen paints its cached rows first and the fresh ones a moment
   * later, into the same row, so a state taken only on mount would keep
   * showing whatever the cache said.
   */
  const [lastHostEnabled, setLastHostEnabled] = useState(host.enabled);
  if (host.enabled !== lastHostEnabled) {
    setLastHostEnabled(host.enabled);
    setIsEnabled(host.enabled);
  }

  const {
    isLoading,
    error,
    request: toggleHost,
  } = useRequest(
    useCallback(async () => {
      const enabled = !isEnabled;
      await HostsAPI.update(host.id, { enabled });
      setIsEnabled(enabled);
      /*
       * The cached host lists still hold the old value. They are read again
       * when they next mount, but until that read lands they would paint this
       * host the way it was, so the change is written into them as well.
       */
      queryClient.setQueriesData<{ hosts?: Host[] }>(
        {
          predicate: (query) => HOST_LISTS.includes(String(query.queryKey[0])),
        },
        (data) =>
          data?.hosts
            ? {
                ...data,
                hosts: data.hosts.map((h) =>
                  h.id === host.id ? { ...h, enabled } : h
                ),
              }
            : data
      );
      if (onToggle) {
        onToggle(enabled);
      }
      return enabled;
    }, [host.id, isEnabled, onToggle, queryClient]),
    host.enabled
  );

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
          id={`host-${host.id}-toggle`}
          label={isEnabled ? t`On` : t`Off`}
          isChecked={Boolean(isEnabled)}
          isDisabled={
            isLoading ||
            isDisabled ||
            !host.summary_fields.user_capabilities?.edit
          }
          onChange={toggleHost}
          ouiaId={`host-${host.id}-toggle`}
          aria-label={t`Toggle Host`}
        />
      </Tooltip>
      {showError && error && !isLoading && (
        <AlertModal
          variant="error"
          title={t`Error!`}
          isOpen={error && !isLoading}
          onClose={() => setShowError(false)}
        >
          {t`Failed to toggle host.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default HostToggle;
