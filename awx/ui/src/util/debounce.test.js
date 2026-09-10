import debounce from './debounce';

describe('debounce', () => {
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
