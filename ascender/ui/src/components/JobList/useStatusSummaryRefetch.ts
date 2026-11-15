import type { JobStatus } from 'types/api';
import type { WebsocketMessage } from 'hooks/useWebsocket';
import { useEffect, useRef } from 'react';
import { shouldRefetchStatusSummary } from './stacks';

export type StatusCounts = Partial<Record<JobStatus, number>>;

export interface UseStatusSummaryRefetchOptions {
  /** The latest message from the list's shared websocket. */
  lastMessage: WebsocketMessage | null;
  /** Reads the current active count per status under the list filters. */
  refetch: () => Promise<StatusCounts>;
  /** Applies refreshed counts; the caller decides whether a page reload is needed. */
  onCounts: (counts: StatusCounts) => void;
  /** Changes when the page/filter changes; stale responses are discarded. */
  pageKey?: string;
  /** Increases when a full page read starts; stale responses are discarded. */
  getPageGeneration?: () => number;
  /** Set false to stop summary reads. */
  enabled?: boolean;
  /** Leading/trailing throttle window, measured from the response. */
  throttleMs?: number;
}

/**
 * Refresh only the active counts for a status-grouped Jobs page.
 *
 * This is the status counterpart of useStackSummaryRefetch.  Status rows have
 * no identity beyond their status, so the response is a counts map rather than
 * rows.  Membership changes (a status disappearing or a new one appearing) are
 * left to the caller, which can ask for a full page read.
 */
export default function useStatusSummaryRefetch({
  lastMessage,
  refetch,
  onCounts,
  pageKey = '',
  getPageGeneration,
  enabled = true,
  throttleMs = 5000,
}: UseStatusSummaryRefetchOptions) {
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const hidden = useRef(false);

  const pageKeyRef = useRef(pageKey);
  const refetchRef = useRef(refetch);
  const onCountsRef = useRef(onCounts);
  const getPageGenerationRef = useRef(getPageGeneration);
  const enabledRef = useRef(enabled);
  const throttleRef = useRef(throttleMs);

  refetchRef.current = refetch;
  onCountsRef.current = onCounts;
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
    if (inFlight.current || timer.current || !pending.current) {
      return;
    }

    pending.current = false;
    const key = pageKeyRef.current;
    const generation = getPageGenerationRef.current?.();
    inFlight.current = true;
    try {
      const counts = await refetchRef.current();
      if (
        !mounted.current ||
        !enabledRef.current ||
        key !== pageKeyRef.current ||
        (generation !== undefined &&
          generation !== getPageGenerationRef.current?.())
      ) {
        return;
      }
      onCountsRef.current(counts);
    } catch {
      // A failed summary read leaves the last good counts in place; the page's
      // safety read remains the eventual correction.
    } finally {
      inFlight.current = false;
      if (mounted.current && enabledRef.current && !hidden.current) {
        if (key === pageKeyRef.current) {
          timer.current = setTimeout(() => {
            timer.current = null;
            run();
          }, throttleRef.current);
        } else if (pending.current) {
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
    pending.current = false;
  }, [enabled]);

  useEffect(() => {
    if (pageKeyRef.current === pageKey) return;
    pageKeyRef.current = pageKey;
    clearTimer();
    pending.current = false;
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
    if (!shouldRefetchStatusSummary(lastMessage)) return;
    pending.current = true;
    run();
  }, [lastMessage, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { flush: run };
}
