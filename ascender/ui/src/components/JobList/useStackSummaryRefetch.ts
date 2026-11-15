import type { WebsocketMessage } from 'hooks/useWebsocket';
import type { UnifiedJob } from 'types/api';
import { useEffect, useRef } from 'react';
import { stackSummaryTemplateIds } from './stacks';

export interface UseStackSummaryRefetchOptions {
  /** The latest message from the list's shared websocket. */
  lastMessage: WebsocketMessage | null;
  /** The stack rows currently on the page. */
  jobs: UnifiedJob[];
  /** Reads summary rows for the requested templates under the current filters. */
  refetch: (templateIds: number[]) => Promise<UnifiedJob[]>;
  /** Merges the returned stack rows into the page in place. */
  onRows: (rows: UnifiedJob[]) => void;
  /** Called when a stack loses a counted member but still has a summary row. */
  onMemberLost?: () => void;
  /** Called when a requested stack or its representative disappears. */
  onStructuralChange?: () => void;
  /** Changes when the page/filter changes; stale responses are discarded. */
  pageKey?: string;
  /** Increases when a full page read starts; stale responses are discarded. */
  getPageGeneration?: () => number;
  /** Set false to stop summary reads. */
  enabled?: boolean;
  /** Leading/trailing throttle window, measured from the response. */
  throttleMs?: number;
}

function visibleStackTemplateIds(jobs: UnifiedJob[]): Set<number> {
  return new Set(
    jobs
      .map((job) => job.stack?.template.id)
      .filter((id): id is number => typeof id === 'number')
  );
}

/**
 * Refresh only the stack rows already on screen.
 *
 * This is the middle ground between updating a row from the websocket and
 * re-reading the whole page.  A message about a visible stack is coalesced
 * into one summary read, so the server still owns the stack counts and the
 * representative row.  When a stack dissolves or its representative changes,
 * the caller is told to do a page read; a surviving stack that only loses a
 * member uses the caller's slower ejection path instead.
 */
export default function useStackSummaryRefetch({
  lastMessage,
  jobs,
  refetch,
  onRows,
  onMemberLost,
  onStructuralChange,
  pageKey = '',
  getPageGeneration,
  enabled = true,
  throttleMs = 5000,
}: UseStackSummaryRefetchOptions) {
  const pending = useRef<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const hidden = useRef(false);

  const pageKeyRef = useRef(pageKey);
  const jobsRef = useRef(jobs);
  const refetchRef = useRef(refetch);
  const onRowsRef = useRef(onRows);
  const onMemberLostRef = useRef(onMemberLost);
  const onStructuralChangeRef = useRef(onStructuralChange);
  const getPageGenerationRef = useRef(getPageGeneration);
  const enabledRef = useRef(enabled);
  const throttleRef = useRef(throttleMs);

  jobsRef.current = jobs;
  refetchRef.current = refetch;
  onRowsRef.current = onRows;
  onMemberLostRef.current = onMemberLost;
  onStructuralChangeRef.current = onStructuralChange;
  getPageGenerationRef.current = getPageGeneration;
  enabledRef.current = enabled;
  throttleRef.current = throttleMs;

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const run = async () => {
    if (!enabledRef.current || hidden.current) {
      return;
    }
    // The request in flight and the throttle window that starts when its
    // response lands both coalesce messages into one trailing read.
    if (inFlight.current || timer.current) {
      return;
    }

    const visible = visibleStackTemplateIds(jobsRef.current);
    const requestedIds = [...pending.current].filter((id) => visible.has(id));
    pending.current.clear();
    if (!requestedIds.length) {
      return;
    }

    const key = pageKeyRef.current;
    const generation = getPageGenerationRef.current?.();
    inFlight.current = true;
    try {
      const rows = await refetchRef.current(requestedIds);
      if (
        !mounted.current ||
        !enabledRef.current ||
        key !== pageKeyRef.current ||
        (generation !== undefined &&
          generation !== getPageGenerationRef.current?.())
      ) {
        return;
      }

      const stackRows = rows.filter(
        (row) =>
          row.stack?.template?.id &&
          requestedIds.includes(row.stack.template.id)
      );
      const previousCounts = new Map(
        jobsRef.current
          .filter((job) => job.stack)
          .map((job) => [job.stack!.template.id, job.stack!.count])
      );
      const returned = new Set(stackRows.map((row) => row.stack!.template.id));

      // A counted member left the stack.  The summary row still exists, but the
      // terminal row it ejected is not part of this response.  The caller can
      // use the slower ejection path instead of a full-page storm.
      const lostMember = stackRows.some((row) => {
        const previous = previousCounts.get(row.stack!.template.id);
        return previous !== undefined && row.stack!.count < previous;
      });
      // A changed representative changes the row id and sorting.  This must be
      // measured before onRows replaces the row, because the summary response
      // alone cannot move the row to its new sort position.
      const representativeChanged = stackRows.some((row) => {
        const templateId = row.stack!.template.id;
        const previous = jobsRef.current.find(
          (job) => job.stack?.template.id === templateId
        );
        return previous !== undefined && previous.id !== row.id;
      });
      const stillVisible = visibleStackTemplateIds(jobsRef.current);
      const stackVanished = requestedIds.some(
        (id) => stillVisible.has(id) && !returned.has(id)
      );

      if (stackRows.length) {
        onRowsRef.current(stackRows);
      }
      if (lostMember) {
        onMemberLostRef.current?.();
      }
      if (representativeChanged || stackVanished) {
        onStructuralChangeRef.current?.();
      }
    } catch {
      // A failed summary read leaves the last good rows in place; the page's
      // safety read remains the eventual correction.
    } finally {
      inFlight.current = false;
      if (mounted.current && enabledRef.current && !hidden.current) {
        if (key === pageKeyRef.current) {
          timer.current = setTimeout(() => {
            timer.current = null;
            if (pending.current.size) {
              run();
            }
          }, throttleRef.current);
        } else if (pending.current.size) {
          run();
        }
      }
    }
  };

  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
    };
  }, []);

  useEffect(() => {
    if (enabled) return;
    clearTimer();
    pending.current.clear();
  }, [enabled]);

  useEffect(() => {
    if (pageKeyRef.current === pageKey) return;
    pageKeyRef.current = pageKey;
    clearTimer();
    pending.current.clear();
  }, [pageKey]);

  useEffect(() => {
    const onVisibilityChange = () => {
      hidden.current = document.hidden;
      if (!document.hidden && enabledRef.current) {
        runRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!enabled || !lastMessage) return;
    const templateIds = stackSummaryTemplateIds(lastMessage, jobsRef.current);
    if (!templateIds.length) return;
    templateIds.forEach((id) => pending.current.add(id));
    run();
  }, [lastMessage, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { flush: run };
}
