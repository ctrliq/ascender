import debounce from './debounce';

describe('debounce', () => {
  // Without this the fake timers installed below outlive this file. The
  // runner shares one environment between the files in a worker, so every
  // file that ran afterwards got them too, and anything waiting on a real
  // clock, waitFor included, stopped behaving.
  afterEach(() => {
    vi.useRealTimers();
  });

  test('it debounces', () => {
    vi.useFakeTimers();
    let count = 0;
    const func = (increment) => {
      count += increment;
    };
    const debounced = debounce(func, 1000);
    debounced(2);
    debounced(2);
    debounced(2);
    debounced(2);
    debounced(2);
    expect(count).toEqual(0);
    vi.advanceTimersByTime(1000);
    expect(count).toEqual(2);
    debounced(2);
    debounced(2);
    debounced(2);
    debounced(2);
    debounced(2);
    vi.advanceTimersByTime(1000);
    debounced(2);
    debounced(2);
    debounced(2);
    debounced(2);
    debounced(2);
    vi.advanceTimersByTime(1000);
    debounced(2);
    debounced(2);
    debounced(2);
    debounced(2);
    debounced(2);
    vi.advanceTimersByTime(1000);
    expect(count).toEqual(8);
  });
});
