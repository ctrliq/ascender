import React from 'react';
import { render, act } from '@testing-library/react';
import useExpanded from './useExpanded';

const array = [{ id: '1' }, { id: '2' }, { id: '3' }];

const result = { current: null };
const latest = () => result.current;

const TestHook = ({ list }) => {
  result.current = useExpanded(list);
  return null;
};

const testHook = (list) => {
  render(<TestHook list={list} />);
};

describe('useExpanded hook', () => {
  test('should return expected initial values', () => {
    testHook();
    expect(latest().expanded).toEqual([]);
    expect(latest().isAllExpanded).toEqual(false);
    expect(latest().handleExpand).toBeInstanceOf(Function);
    expect(latest().setExpanded).toBeInstanceOf(Function);
  });

  test('handleExpand should update and filter expanded items', () => {
    testHook();

    act(() => {
      latest().handleExpand(array[0]);
    });
    expect(latest().expanded).toEqual([array[0]]);

    act(() => {
      latest().handleExpand(array[0]);
    });
    expect(latest().expanded).toEqual([]);
  });

  test('should return expected isAllExpanded value', () => {
    testHook(array);

    act(() => {
      latest().handleExpand(array[0]);
    });
    expect(latest().expanded).toEqual([array[0]]);
    expect(latest().isAllExpanded).toEqual(false);

    act(() => {
      latest().handleExpand(array[1]);
    });
    act(() => {
      latest().handleExpand(array[2]);
    });
    expect(latest().expanded).toEqual(array);
    expect(latest().isAllExpanded).toEqual(true);

    act(() => {
      latest().setExpanded([]);
    });
    expect(latest().expanded).toEqual([]);
    expect(latest().isAllExpanded).toEqual(false);
  });

  test('should return expandAll', () => {
    testHook(array);

    act(() => {
      latest().expandAll(true);
    });
    expect(latest().isAllExpanded).toEqual(true);
    expect(latest().expanded).toEqual(array);

    act(() => {
      latest().expandAll(false);
    });
    expect(latest().isAllExpanded).toEqual(false);
    expect(latest().expanded).toEqual([]);
  });
});
