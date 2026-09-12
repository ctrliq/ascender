import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

/**
 * Whether the component is still on screen, for guarding a setState that
 * would otherwise land after an unmount.
 */
export default function useIsMounted(): MutableRefObject<boolean> {
  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  });
  return isMounted;
}
