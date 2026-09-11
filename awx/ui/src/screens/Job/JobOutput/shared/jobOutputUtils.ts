import type { Untyped } from 'types/api';

export default function getRowRangePageSize(
  startIndex: Untyped,
  stopIndex: Untyped
) {
  let page: Untyped;
  let pageSize: Untyped;

  if (startIndex === stopIndex) {
    page = startIndex;
    pageSize = 1;
  } else if (stopIndex >= startIndex + 50) {
    page = Math.floor(startIndex / 50) + 1;
    pageSize = 50;
  } else {
    for (let i = stopIndex - startIndex + 1; i <= 50; i++) {
      if (
        Math.floor(startIndex / i) === Math.floor(stopIndex / i) ||
        i === 50
      ) {
        page = Math.floor(startIndex / i) + 1;
        pageSize = i;
        break;
      }
    }
  }

  return {
    page,
    pageSize,
    firstIndex: (page - 1) * pageSize,
  };
}
