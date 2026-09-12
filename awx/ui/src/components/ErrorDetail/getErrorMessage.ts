/**
 * The message a failed request carries, as the api shapes them.
 *
 * Args:
 *   response: the response off the error, absent where the request never
 *     reached the api.
 *
 * Returns:
 *   The detail where the api sent one, the body where it is already a string,
 *   the flattened field errors otherwise, and null where there is no body.
 */
export default function getErrorMessage(response?: { data?: unknown }) {
  if (!response?.data) {
    return null;
  }
  if (typeof response.data === 'string') {
    return response.data;
  }
  const { detail } = response.data as { detail?: string };
  if (detail) {
    return detail;
  }
  return Object.values(response.data as Record<string, unknown>).reduce(
    (acc: unknown[], currentValue) => acc.concat(currentValue as unknown[]),
    [] as unknown[]
  );
}
