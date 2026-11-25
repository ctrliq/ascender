import type { WebsocketMessage } from 'hooks/useWebsocket';
import { useEffect, useRef } from 'react';
import useWebsocket from 'hooks/useWebsocket';

export interface UseThrottledRefetchOptions {
  /** Re-reads the current page.  Rejecting leaves the previous page in place. */
  refetch: () => Promise<unknown>;
  /** Whether a websocket message could change the current page. */
  shouldRefetch: (message: WebsocketMessage) => boolean;
  /**
   * Whether a terminal message may have ejected a row from a visible group.
   * These messages get their own slower full-page throttle.
   */
  shouldEject?: (message: WebsocketMessage) => boolean;
  /** Leading/trailing throttle window, measured from the response. */
  throttleMs?: number;
  /** Ejection throttle, measured from the start of the last full page. */
  ejectionThrottleMs?: number;
  /** Safety interval in case websocket bursts were dropped. */
  safetyIntervalMs?: number;
  /** Random extra delay added to each safety interval. */
  safetyJitterMs?: number;
  /** Set false to stop the websocket and safety refetches. */
  enabled?: boolean;
}

/**
 * Refetch the stacked Jobs page when a websocket message could change it.
 *
 * The by-id path used by useWsJobs cannot be used while grouping without a
 * template filter, because stack membership must be evaluated without an
 * id__in restriction.  Instead this refetches the current page:
 *   - leading + trailing throttle, and the window starts when a response lands;
 *   - at most one request in flight, with stale responses discarded;
 *   - paused while the tab is hidden, catching up when it becomes visible;
 *   - a slow safety refetch for dropped websocket bursts;
 *   - a separate, slower ejection path for terminal rows that left a group;
 *   - a failed background refetch keeps the last good page.
 */
export default function useThrottledRefetch({
  refetch,
  shouldRefetch,
  shouldEject = () => false,
  throttleMs = 2000,
  ejectionThrottleMs = 10000,
  safetyIntervalMs = 30000,
  safetyJitterMs = 0,
  enabled = true,
}: UseThrottledRefetchOptions) {
  const lastMessage = useWebsocket(
    {
      jobs: ['status_changed'],
      schedules: ['changed'],
      control: ['limit_reached_1'],
    },
    enabled
  );

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const shouldRefetchRef = useRef(shouldRefetch);
  shouldRefetchRef.current = shouldRefetch;
  const shouldEjectRef = useRef(shouldEject);
  shouldEjectRef.current = shouldEject;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ejectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const ejectionPending = useRef(false);
  const ejectionLastMessageAt = useRef(0);
  // The page that mounted this hook is the baseline; the first ejection waits
  // out the window rather than firing immediately after a fresh page load.
  const lastFullPageAt = useRef(Date.now());
  const mounted = useRef(true);
  const hidden = useRef(false);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const clearEjectionTimer = () => {
    if (ejectionTimer.current) {
      clearTimeout(ejectionTimer.current);
      ejectionTimer.current = null;
    }
  };

  const clearEjection = () => {
    clearEjectionTimer();
    ejectionPending.current = false;
  };

  const runRefetch = async () => {
    if (!enabled || hidden.current) {
      pending.current = true;
      return;
    }
    // A request in flight, or the throttle window that starts when its response
    // lands, coalesces further messages into one trailing refetch.
    if (inFlight.current || timer.current) {
      pending.current = true;
      return;
    }
    pending.current = false;
    inFlight.current = true;
    // Any page that starts after an ejection message includes it, and starts a
    // fresh ejection window.  A failed read still waits for the next safety
    // read rather than hammering the endpoint.
    lastFullPageAt.current = Date.now();
    clearEjection();
    try {
      await refetchRef.current();
    } catch {
      // A background refresh failure leaves the last good page in place.
    } finally {
      inFlight.current = false;
      if (mounted.current && enabled && !hidden.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          if (
            pending.current &&
            mounted.current &&
            enabled &&
            !hidden.current
          ) {
            pending.current = false;
            runRefetch();
          }
        }, throttleMs);
      }
    }
  };

  const scheduleEjection = () => {
    if (!enabled || hidden.current || ejectionTimer.current) return;
    const wait = Math.max(
      0,
      ejectionThrottleMs - (Date.now() - lastFullPageAt.current)
    );
    ejectionTimer.current = setTimeout(() => {
      ejectionTimer.current = null;
      if (!mounted.current || !enabled || hidden.current) return;
      if (!ejectionPending.current) return;
      if (lastFullPageAt.current > ejectionLastMessageAt.current) {
        // A full page that started after the message already includes it.
        ejectionPending.current = false;
        return;
      }
      ejectionPending.current = false;
      runRefetch();
    }, wait);
  };

  const noteEjection = () => {
    if (!enabled) return;
    ejectionPending.current = true;
    ejectionLastMessageAt.current = Date.now();
    scheduleEjection();
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
      clearEjectionTimer();
      if (safetyTimer.current) {
        clearTimeout(safetyTimer.current);
        safetyTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (enabled) return;
    // Stop the throttle windows from firing a stale refetch after grouping is
    // turned off.  A later enable starts from a clean slate.
    clearTimer();
    clearEjection();
    pending.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    const onVisibilityChange = () => {
      hidden.current = document.hidden;
      if (!document.hidden && enabled) {
        runRefetch();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return () => {};
    let cancelled = false;
    const scheduleSafety = () => {
      const jitter = safetyJitterMs > 0 ? Math.random() * safetyJitterMs : 0;
      safetyTimer.current = setTimeout(() => {
        if (cancelled) return;
        runRefetch();
        if (!cancelled) scheduleSafety();
      }, safetyIntervalMs + jitter);
    };
    scheduleSafety();
    return () => {
      cancelled = true;
      if (safetyTimer.current) {
        clearTimeout(safetyTimer.current);
        safetyTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, safetyIntervalMs, safetyJitterMs]);

  useEffect(() => {
    if (!enabled || !lastMessage) return;
    if (shouldRefetchRef.current(lastMessage)) {
      if (inFlight.current) {
        pending.current = true;
        return;
      }
      runRefetch();
      return;
    }
    if (shouldEjectRef.current(lastMessage)) {
      noteEjection();
    }
  }, [lastMessage, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { refetch: runRefetch, noteEjection, lastMessage };
}
