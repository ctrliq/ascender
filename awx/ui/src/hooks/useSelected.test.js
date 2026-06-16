import React from 'react';
import { render, act } from '@testing-library/react';
import useSelected from './useSelected';

const array = [{ id: '1' }, { id: '2' }, { id: '3' }];

const result = { current: null };
const latest = () => result.current;

const TestHook = ({ list }) => {
  result.current = useSelected(list);
  return null;
};

const testHook = (list) => {
  render(<TestHook list={list} />);
};

describe('useSelected hook', () => {
  test('should return expected initial values', () => {
    testHook();
    expect(latest().selected).toEqual([]);
    expect(latest().isAllSelected).toEqual(false);
    expect(latest().handleSelect).toBeInstanceOf(Function);
    expect(latest().setSelected).toBeInstanceOf(Function);
  });

  test('handleSelect should update and filter selected items', () => {
    testHook();

    act(() => {
      latest().handleSelect(array[0]);
    });
    expect(latest().selected).toEqual([array[0]]);

    act(() => {
      latest().handleSelect(array[0]);
    });
    expect(latest().selected).toEqual([]);
  });

  test('should return expected isAllSelected value', () => {
    testHook(array);

    act(() => {
      latest().handleSelect(array[0]);
    });
    expect(latest().selected).toEqual([array[0]]);
    expect(latest().isAllSelected).toEqual(false);

    act(() => {
      latest().handleSelect(array[1]);
    });
    act(() => {
      latest().handleSelect(array[2]);
    });
    expect(latest().selected).toEqual(array);
    expect(latest().isAllSelected).toEqual(true);

    act(() => {
      latest().setSelected([]);
    });
    expect(latest().selected).toEqual([]);
    expect(latest().isAllSelected).toEqual(false);
  });

  test('should return selectAll', () => {
    testHook(array);

    act(() => {
      latest().selectAll(true);
    });
    expect(latest().isAllSelected).toEqual(true);
    expect(latest().selected).toEqual(array);

    act(() => {
      latest().selectAll(false);
    });
    expect(latest().isAllSelected).toEqual(false);
    expect(latest().selected).toEqual([]);
  });

  test('should return clearSelected', () => {
    testHook(array);

    act(() => {
      latest().selectAll(true);
    });

    act(() => {
      latest().clearSelected();
    });
    expect(latest().isAllSelected).toEqual(false);
    expect(latest().selected).toEqual([]);
  });
});
