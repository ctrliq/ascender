import { useCallback, useEffect, useRef } from 'react';
import { WorkflowApprovalsAPI } from 'api';
import type { WorkflowApproval } from 'types/api';
import { useConfig } from 'contexts/Config';
import useRequest from 'hooks/useRequest';
import useWsPendingApprovalCount from './useWsPendingApprovalCount';

/** The largest page the API serves, so paging through takes few requests. */
const APPROVAL_PAGE_SIZE = 200;

/**
 * The shortest gap between two re-reads the websocket asks for. A busy
 * workflow sends approval messages in bursts, and each re-read can be several
 * pages of full approvals for a user who is not a superuser.
 */
export const APPROVAL_REFRESH_INTERVAL = 5000;

/**
 * Whether this user can act on an approval right now.
 *
 * The API answers can_approve_or_deny per user and only for a pending
 * approval. An approval that needs several votes stays pending after this
 * user has cast theirs, and a second vote is refused, so it no longer waits
 * on them.
 *
 * Args:
 *     approval: One row of the workflow approvals list.
 *
 * Returns:
 *     True when this user may still approve or deny it.
 */
export function isAwaitingMe(approval: WorkflowApproval | undefined): boolean {
  return !!approval?.can_approve_or_deny && !approval?.user_has_voted;
}

/**
 * How many approvals are waiting on this user.
 *
 * Pending is not the same as actionable: a workflow can be waiting on somebody
 * else, and a count that included those would put a number beside Approvals
 * that the person reading it cannot clear.
 *
 * The list cannot filter on whether the reader may approve, so the count comes
 * in two steps. A one row read of the pending approvals this user has not voted
 * on gives the total the answer cannot exceed; when that is zero, or the user
 * is a superuser, who may decide every pending approval, it is the answer.
 * Anyone else has every page of that list read and counted where
 * can_approve_or_deny holds, rather than the first page only, so a long queue
 * is never undercounted.
 *
 * Returns:
 *     The count, re-read whenever a workflow approval changes, at most once
 *     every APPROVAL_REFRESH_INTERVAL.
 */
export default function usePendingApprovalCount(): number {
  const { me } = useConfig();
  const userId = me?.id as number | undefined;
  const isSuperuser = !!me?.is_superuser;

  const { request: fetchCount, result: count } = useRequest(
    useCallback(async () => {
      const params: Record<string, string | number> = { status: 'pending' };
      if (userId) {
        params.not__votes__user = userId;
      }

      // Step 1: the ceiling, one row long.
      const { data: probe } = await WorkflowApprovalsAPI.read({
        ...params,
        page_size: 1,
      });
      if (!probe.count) {
        return 0;
      }
      if (isSuperuser && userId) {
        return probe.count;
      }

      // Step 2: every page, counting the rows this user can decide.
      let actionable = 0;
      for (let page = 1; ; page += 1) {
        // Sequential on purpose: each page says whether there is another.
        // eslint-disable-next-line no-await-in-loop
        const { data } = await WorkflowApprovalsAPI.read({
          ...params,
          page,
          page_size: APPROVAL_PAGE_SIZE,
        });
        actionable += (data.results || []).filter(isAwaitingMe).length;
        if (!data.next) {
          return actionable;
        }
      }
    }, [userId, isSuperuser]),
    0
  );

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Leading and trailing: the first message of a burst re-reads at once, the
  // rest collapse into one re-read when the interval is up, so the last change
  // is always reflected.
  const lastRun = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const throttledFetch = useCallback(() => {
    if (trailing.current) {
      return;
    }
    const wait = lastRun.current + APPROVAL_REFRESH_INTERVAL - Date.now();
    if (wait <= 0) {
      lastRun.current = Date.now();
      fetchCount();
      return;
    }
    trailing.current = setTimeout(() => {
      trailing.current = undefined;
      lastRun.current = Date.now();
      fetchCount();
    }, wait);
  }, [fetchCount]);

  useEffect(
    () => () => {
      clearTimeout(trailing.current);
      trailing.current = undefined;
    },
    [fetchCount]
  );

  return useWsPendingApprovalCount(count as number, throttledFetch) as number;
}
