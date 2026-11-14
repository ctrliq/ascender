import { useEffect, useState } from 'react';
import { InventoryUpdatesAPI, ProjectUpdatesAPI } from 'api';
import { useConfig } from 'contexts/Config';
import { isJobCancelable } from 'util/jobs';
import type { JobStatus, UserCapabilities } from 'types/api';

type SyncType = 'project_update' | 'inventory_update';

interface UpdateDetail {
  summary_fields?: { user_capabilities?: UserCapabilities } | null;
}

/**
 * Whether to offer Cancel Sync on a project or an inventory source.
 *
 * The run a project or a source points at, summary_fields.current_job or
 * last_job, carries no capabilities of its own, and the capability the object
 * reports for starting a sync is not the one the api checks on cancel. The api
 * lets the run's creator, an admin of the project or of the inventory, and a
 * superuser cancel it.
 *
 * The object's own edit capability is that admin role, so an admin and a
 * superuser are answered without a request. Anyone else may still be the one
 * who started the run, which only the run itself can tell, so for them the
 * running update is read once and its cancel capability used. That read only
 * happens while a sync can still be canceled, and once per run.
 *
 * @param type The kind of update the sync runs, which picks the endpoint.
 * @param jobId The id of the current update, if there is one.
 * @param status The status of the current update.
 * @param isAdmin Whether the object reports the edit capability.
 * @returns Whether to show Cancel Sync.
 */
export default function useCanCancelSync(
  type: SyncType,
  jobId: number | null | undefined,
  status: JobStatus | string | null | undefined,
  isAdmin: boolean | undefined
): boolean {
  const { me } = useConfig();
  const isCancelable = isJobCancelable(status);
  const isKnownAllowed = Boolean(isAdmin || me?.is_superuser);
  const needsLookup = isCancelable && !isKnownAllowed && Boolean(jobId);

  // The answer is kept with the run it belongs to, so a new run never shows
  // the answer given for the one before it.
  const [lookup, setLookup] = useState<{ id: number; cancel: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!needsLookup || !jobId) {
      return undefined;
    }
    let isCurrent = true;
    const model =
      type === 'project_update' ? ProjectUpdatesAPI : InventoryUpdatesAPI;
    (async () => {
      try {
        const response = await model.readDetail<UpdateDetail>(jobId);
        if (isCurrent) {
          setLookup({
            id: jobId,
            cancel: Boolean(
              response?.data?.summary_fields?.user_capabilities?.cancel
            ),
          });
        }
      } catch {
        // A run the user cannot read is one they cannot cancel either.
        if (isCurrent) {
          setLookup({ id: jobId, cancel: false });
        }
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [type, jobId, needsLookup]);

  if (!isCancelable) {
    return false;
  }
  if (isKnownAllowed) {
    return true;
  }
  return Boolean(lookup && lookup.id === jobId && lookup.cancel);
}
