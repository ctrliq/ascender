import type { Paginated } from 'types/api';
import { parseQueryString } from 'util/qs';
import type { QSConfig, QSParams } from 'util/qs';

/** The params a list reads its pages with, which a search does not set. */
const PAGING_KEYS = ['page', 'page_size', 'order_by'];

/** How many rows each request asks for while reading a whole list. */
const PAGE_SIZE = 200;

/**
 * The search in force on a list, without its paging or order.
 *
 * Sync All reads what the search matches rather than what one page shows, so
 * the counts that enable the button and the rows a click starts are taken
 * with these, and agree with the list the reader is looking at.
 *
 * Args:
 *   qsConfig: the list's query string config.
 *   search: the location's query string.
 *
 * Returns:
 *   Every param the reader's search set, and nothing else.
 */
export function getSearchFilters(
  qsConfig: QSConfig,
  search: string | null | undefined
): QSParams {
  return Object.fromEntries(
    Object.entries(parseQueryString(qsConfig, search)).filter(
      ([key]) => !PAGING_KEYS.includes(key)
    )
  );
}

/**
 * Every row a list request matches, read page by page until the api says
 * there is no next one.
 *
 * A single request stops at the page size, which would leave the rows past
 * it out of a Sync All without a word, so the pages are followed to the end.
 *
 * Args:
 *   read: asks the api for one page with the params it is handed.
 *   params: the filters to read with; paging and order are set here.
 *
 * Returns:
 *   The rows of every page, in name order.
 *
 * Raises:
 *   Whatever the api raises for a page, which ends the read.
 */
export async function readEveryPage<T>(
  read: (params: QSParams) => Promise<{ data: Paginated<T> }>,
  params: QSParams
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    // Pages are read one after another, since each says whether there is a next.
    // eslint-disable-next-line no-await-in-loop
    const { data } = await read({
      ...params,
      page,
      page_size: PAGE_SIZE,
      order_by: 'name',
    });
    rows.push(...data.results);
    hasNext = Boolean(data.next) && data.results.length > 0;
    page += 1;
  }
  return rows;
}
