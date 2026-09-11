import type { Untyped } from 'types/api';

export default function getErrorMessage(response: Untyped) {
  if (!response?.data) {
    return null;
  }
  if (typeof response.data === 'string') {
    return response.data;
  }
  if (response.data.detail) {
    return response.data.detail;
  }
  return Object.values(response.data as Record<string, unknown>).reduce(
    (acc: unknown[], currentValue) => acc.concat(currentValue as unknown[]),
    [] as unknown[]
  );
}
