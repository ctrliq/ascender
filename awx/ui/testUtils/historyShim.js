import { UNSAFE_createMemoryHistory } from 'react-router';

export function createMemoryHistory(opts) {
  return UNSAFE_createMemoryHistory({ v5Compat: true, ...opts });
}

export default { createMemoryHistory };
