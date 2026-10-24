/**
 * Runs a request for each item, a few at a time, and settles every one.
 *
 * Firing every request at once is what a list of hundreds would do otherwise:
 * the browser queues most of them behind its per-host limit anyway, and the
 * server takes the whole burst in one go. At most `limit` are in flight here,
 * and the next one starts as soon as any of them answers, so a slow request
 * holds up one slot rather than a whole batch.
 *
 * Like Promise.allSettled, a rejection does not stop the others, and the
 * answers come back in the order the items were given, whichever order they
 * arrived in, so a refusal can still be matched to the item it belongs to.
 *
 * Args:
 *     items: What to make a request for, one each.
 *     limit: How many requests may be in flight at once, at least one.
 *     run: Makes the request for one item.
 *
 * Returns:
 *     The settled answer of each item, in the items' order.
 */
export async function settleInBatches<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const answers: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  // Each worker takes the next item as soon as it is free, until none are
  // left; the shared counter is safe since the loop only yields at await.
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        const value = await run(items[index] as T, index);
        answers[index] = { status: 'fulfilled', value };
      } catch (reason) {
        answers[index] = { status: 'rejected', reason };
      }
    }
  };

  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return answers;
}

/**
 * Runs a request for each item, a few at a time, and fails where any did.
 *
 * The same pacing as settleInBatches, for reads where one failure makes the
 * rest meaningless: once every request has answered, the first rejection in
 * the items' order is what this rejects with.
 *
 * Args:
 *     items: What to make a request for, one each.
 *     limit: How many requests may be in flight at once, at least one.
 *     run: Makes the request for one item.
 *
 * Returns:
 *     The answer of each item, in the items' order.
 *
 * Raises:
 *     The reason of the first item, in the items' order, whose request failed.
 */
export async function mapInBatches<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const answers = await settleInBatches(items, limit, run);
  return answers.map((answer) => {
    if (answer.status === 'rejected') {
      throw answer.reason;
    }
    return answer.value;
  });
}
