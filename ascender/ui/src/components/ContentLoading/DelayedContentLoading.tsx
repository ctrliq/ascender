import React, { useEffect, useState } from 'react';
import ContentLoading from './ContentLoading';

export interface DelayedContentLoadingProps {
  /** How long to wait before there is anything to look at. */
  delayMs?: number;
}

/**
 * The loading state for a wait that is usually too short to be worth showing.
 *
 * A screen is code split, so the route it lives in suspends while its module
 * arrives and then shows its own loading state while it reads its data. Both
 * are the same animation, but the module arrives before the screen's header
 * exists, so the first one sits at the top of the page and the second one lower
 * down: one load, animating twice, in two places. Nothing is drawn here until
 * the wait is long enough to need it, which on a built application is almost
 * never, and what the page shows then is the screen's own loading state alone.
 */
function DelayedContentLoading({ delayMs = 1000 }: DelayedContentLoadingProps) {
  const [hasWaited, setHasWaited] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setHasWaited(true), delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs]);

  return hasWaited ? <ContentLoading /> : null;
}

export default DelayedContentLoading;
