import React from 'react';
import { render, act } from '@testing-library/react';
import type { Expandable } from './useExpanded';
import useExpanded from './useExpanded';

const array = [{ id: '1' }, { id: '2' }, { id: '3' }];

const result: { current: ReturnType<typeof useExpanded> } = {
  current: null as unknown as ReturnType<typeof useExpanded>,
};
const latest = () => result.current;

const TestHook = ({ list }: { list?: Expandable[] }) => {
  result.current = useExpanded(list);
  return null;
};

const testHook = (list?: Expandable[]) => {
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
      latest().handleExpand(array[0] as Expandable);
    });
    expect(latest().expanded).toEqual([array[0]]);

    act(() => {
      latest().handleExpand(array[0] as Expandable);
    });
    expect(latest().expanded).toEqual([]);
  });

  test('should return expected isAllExpanded value', () => {
    testHook(array);

    act(() => {
      latest().handleExpand(array[0] as Expandable);
    });
    expect(latest().expanded).toEqual([array[0]]);
    expect(latest().isAllExpanded).toEqual(false);

    act(() => {
      latest().handleExpand(array[1] as Expandable);
    });
    act(() => {
      latest().handleExpand(array[2] as Expandable);
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
