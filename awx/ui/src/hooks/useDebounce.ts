import { useRef } from 'react';

/**
 * Delays a call until the caller stops making it, which is how the search
 * inputs avoid a request per keystroke.
 */
export default function useDebounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  const timeOutRef = useRef<number | undefined>(undefined);

  function debouncedFunction(...args: Args) {
    window.clearTimeout(timeOutRef.current);
    timeOutRef.current = window.setTimeout(() => {
      fn(...args);
    }, delay);
  }

  return debouncedFunction;
}
