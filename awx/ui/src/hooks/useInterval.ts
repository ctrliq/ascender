import { useEffect, useRef } from 'react';

/**
 * Calls back on an interval, restarting only when the delay changes. A null
 * delay pauses it, which is how callers stop polling without unmounting.
 */
export default function useInterval<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number | null
): void {
  const savedCallbackRef = useRef<(...args: Args) => void>(callback);
  useEffect(() => {
    savedCallbackRef.current = callback;
  }, [callback]);
  useEffect(() => {
    const handler = (...args: Args) => savedCallbackRef.current(...args);
    if (delay !== null) {
      const intervalId = setInterval(handler, delay);
      return () => clearInterval(intervalId);
    }
    return () => undefined;
  }, [delay]);
}
