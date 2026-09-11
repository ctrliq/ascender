import type { AnyJob } from 'types/api';
import getRowRangePageSize from './shared/jobOutputUtils';

/** The query the events endpoint is asked with, page first. */
export interface EventRequestParams {
  page: number;
  page_size: number;
  /** Set in flat mode, where events with no stdout draw nothing. */
  not__stdout?: string;
  /** Caps the request below the first counter the websocket delivered. */
  counter__lt?: number;
}

/**
 * The page to request for a range of output rows, and the rows it covers.
 *
 * Args:
 *   job: unused, kept because every caller has one to hand.
 *   remoteRowCount: how many rows the job has in total.
 *   requestRange: the first and last row the caller wants.
 *
 * Returns:
 *   The page params to request with, and the row numbers that page holds.
 */
export default function getEventRequestParams(
  job: AnyJob,
  remoteRowCount: number,
  requestRange: [number, number]
): [EventRequestParams, number[]] {
  const [startIndex, stopIndex] = requestRange;
  const { page, pageSize, firstIndex } = getRowRangePageSize(
    startIndex,
    stopIndex
  );
  const loadRange = range(
    firstIndex + 1,
    Math.min(firstIndex + pageSize, remoteRowCount)
  );

  return [{ page, page_size: pageSize }, loadRange];
}

export function range(low: number, high: number) {
  const numbers = [];
  for (let n = low; n <= high; n++) {
    numbers.push(n);
  }
  return numbers;
}
