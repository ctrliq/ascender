import type { Untyped } from 'types/api';
import getRowRangePageSize from './shared/jobOutputUtils';

export default function getEventRequestParams(
  job: Untyped,
  remoteRowCount: Untyped,
  requestRange: Untyped
): [Record<string, Untyped>, number[]] {
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

export function range(low: Untyped, high: Untyped) {
  const numbers = [];
  for (let n = low; n <= high; n++) {
    numbers.push(n);
  }
  return numbers;
}
