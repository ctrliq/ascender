import { UNSAFE_createMemoryHistory } from 'react-router';

/** The history a test drives the router with, already in v5 compatible mode. */
export type TestHistory = ReturnType<typeof UNSAFE_createMemoryHistory>;

export function createMemoryHistory(opts?: {
  /** Each entry is a path, or a path with the state a screen was sent. */
  initialEntries?: (string | { pathname: string; state?: unknown })[];
  initialIndex?: number;
  state?: unknown;
}): TestHistory {
  return UNSAFE_createMemoryHistory({ v5Compat: true, ...opts });
}

export default { createMemoryHistory };
