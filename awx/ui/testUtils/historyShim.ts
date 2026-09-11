import type { Untyped } from 'types/api';
import { UNSAFE_createMemoryHistory } from 'react-router';

export function createMemoryHistory(opts?: Untyped) {
  return UNSAFE_createMemoryHistory({ v5Compat: true, ...opts });
}

export default { createMemoryHistory };
