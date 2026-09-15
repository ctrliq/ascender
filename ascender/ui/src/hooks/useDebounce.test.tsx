import React from 'react';
import { render, act } from '@testing-library/react';
import useDebounce from './useDebounce';

function Test({
  fn,
  delay = 500,
  data,
}: {
  fn: (data: unknown) => void;
  delay?: number;
  data: unknown;
}) {
  const debounce = useDebounce(fn, delay);
  debounce(data);
  return <div />;
}

test('useDebounce', () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  render(<Test fn={fn} data={{ data: 123 }} />);
  expect(fn).toHaveBeenCalledTimes(0);
  act(() => {
    vi.advanceTimersByTime(510);
  });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith({ data: 123 });
  vi.useRealTimers();
});
