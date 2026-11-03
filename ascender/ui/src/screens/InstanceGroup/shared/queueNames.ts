import { useCallback, useEffect } from 'react';
import { SettingsAPI } from 'api';
import { useConfig } from 'contexts/Config';
import useRequest from 'hooks/useRequest';

/**
 * The names of the two instance groups the installer creates.
 *
 * The api reads both from its DEFAULT_CONTROL_PLANE_QUEUE_NAME and
 * DEFAULT_EXECUTION_QUEUE_NAME settings, and every rule it holds about them,
 * that a hybrid node stays in the control plane group and that neither group
 * may be renamed, follows the setting rather than a fixed name. An install
 * may name them otherwise, so the ui asks rather than assuming.
 */
export interface QueueNames {
  /** The group control plane tasks run in, `controlplane` out of the box. */
  controlPlane: string;
  /** The group user jobs fall back to, `default` out of the box. */
  execution: string;
}

/**
 * The names an install gets when nothing says otherwise.
 *
 * The system settings are read only to a superuser or a system auditor, so
 * anybody else, or a read that fails, gets these. Those viewers are also the
 * ones the api refuses membership changes and renames to, so a guess that is
 * wrong on a renamed install costs them nothing they could have done.
 */
export const DEFAULT_QUEUE_NAMES: QueueNames = {
  controlPlane: 'controlplane',
  execution: 'default',
};

/**
 * The queue names out of a read of the system settings.
 *
 * Args:
 *     settings: The system category as the api returns it, or nothing when it
 *         could not be read.
 *
 * Returns:
 *     The names the settings give, each falling back to its default where the
 *     settings hold no usable name for it.
 */
export function queueNamesFrom(
  settings: Record<string, unknown> | null | undefined
): QueueNames {
  const name = (key: string, fallback: string) => {
    const value = settings?.[key];
    return typeof value === 'string' && value ? value : fallback;
  };
  return {
    controlPlane: name(
      'DEFAULT_CONTROL_PLANE_QUEUE_NAME',
      DEFAULT_QUEUE_NAMES.controlPlane
    ),
    execution: name(
      'DEFAULT_EXECUTION_QUEUE_NAME',
      DEFAULT_QUEUE_NAMES.execution
    ),
  };
}

/**
 * The installer's two group names, read once for the component using it.
 *
 * Only a viewer who may read the system settings asks for them; everyone
 * else, and a read that fails, gets the defaults. The defaults are also what
 * the first render sees, so a screen draws at once and settles on the real
 * names when they arrive.
 *
 * Returns:
 *     The control plane and execution group names.
 */
export function useQueueNames(): QueueNames {
  const { me } = useConfig();
  const canReadSettings = Boolean(me?.is_superuser || me?.is_system_auditor);

  const { result, request } = useRequest(
    useCallback(async () => {
      if (!canReadSettings) {
        return DEFAULT_QUEUE_NAMES;
      }
      const response = await SettingsAPI.readCategory('system');
      return queueNamesFrom(
        response?.data as Record<string, unknown> | undefined
      );
    }, [canReadSettings]),
    DEFAULT_QUEUE_NAMES
  );

  useEffect(() => {
    request();
  }, [request]);

  // A failed read leaves the result where it started, on the defaults.
  return result ?? DEFAULT_QUEUE_NAMES;
}
