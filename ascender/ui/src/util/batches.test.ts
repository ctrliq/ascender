import { mapInBatches, settleInBatches } from './batches';

/** A request that answers when the test says so, and records that it began. */
function deferred() {
  const started: number[] = [];
  const answer: Record<number, (value: string) => void> = {};
  const fail: Record<number, (reason: Error) => void> = {};
  const run = (item: number) => {
    started.push(item);
    return new Promise<string>((resolve, reject) => {
      answer[item] = resolve;
      fail[item] = reject;
    });
  };
  return { started, answer, fail, run };
}

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('settleInBatches', () => {
  test('should hold no more than the limit in flight', async () => {
    const { started, answer, run } = deferred();
    const settled = settleInBatches([1, 2, 3, 4, 5, 6, 7], 3, run);
    await flush();
    expect(started).toEqual([1, 2, 3]);

    // One answering frees one slot, whichever it was.
    answer[2]?.('two');
    await flush();
    expect(started).toEqual([1, 2, 3, 4]);

    [1, 3, 4, 5, 6, 7].forEach((item) => {
      answer[item]?.(`item ${item}`);
    });
    await flush();
    [5, 6, 7].forEach((item) => answer[item]?.(`item ${item}`));
    const answers = await settled;
    expect(started).toHaveLength(7);
    expect(answers[1]).toEqual({ status: 'fulfilled', value: 'two' });
  });

  test('should keep going past a refusal, in the order given', async () => {
    const answers = await settleInBatches([1, 2, 3], 2, async (item) => {
      if (item === 2) {
        throw new Error('no');
      }
      return item * 10;
    });
    expect(answers).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'rejected', reason: new Error('no') },
      { status: 'fulfilled', value: 30 },
    ]);
  });

  test('should settle an empty list at once', async () => {
    expect(await settleInBatches([], 5, async () => 1)).toEqual([]);
  });
});

describe('mapInBatches', () => {
  test('should answer in the order given', async () => {
    expect(
      await mapInBatches([3, 1, 2], 2, async (item) => {
        await new Promise((resolve) => {
          setTimeout(resolve, item);
        });
        return item;
      })
    ).toEqual([3, 1, 2]);
  });

  test('should reject with the first failure', async () => {
    await expect(
      mapInBatches([1, 2, 3], 2, async (item) => {
        if (item > 1) {
          throw new Error(`failed ${item}`);
        }
        return item;
      })
    ).rejects.toThrow('failed 2');
  });
});
