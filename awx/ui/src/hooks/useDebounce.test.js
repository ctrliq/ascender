import React from 'react';
import { render, act } from '@testing-library/react';
import useDebounce from './useDebounce';

function Test({ fn, delay = 500, data }) {
  const debounce = useDebounce(fn, delay);
  debounce(data);
  return <div />;
}

test('useDebounce', () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  render(<Test fn={fn} data={{ data: 123 }} />);
  expect(fn).toHaveBeenCalledTimes(0);
  act(() => {
    jest.advanceTimersByTime(510);
  });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith({ data: 123 });
  jest.useRealTimers();
});
