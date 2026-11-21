import React from 'react';
import { render, act } from '@testing-library/react';
import type { Selectable } from './useSelected';
import useSelected from './useSelected';

const array = [{ id: '1' }, { id: '2' }, { id: '3' }];

const result: { current: ReturnType<typeof useSelected> } = {
  current: null as unknown as ReturnType<typeof useSelected>,
};
const latest = () => result.current;

const TestHook = ({
  list,
  defaultSelected,
  prune,
}: {
  list?: Selectable[];
  defaultSelected?: Selectable[];
  prune?: boolean;
}) => {
  result.current = useSelected(list, defaultSelected, prune);
  return null;
};

const testHook = (
  list?: Selectable[],
  defaultSelected?: Selectable[],
  prune?: boolean
) =>
  render(
    <TestHook list={list} defaultSelected={defaultSelected} prune={prune} />
  );

describe('useSelected hook', () => {
  test('should return expected initial values', () => {
    testHook();
    expect(latest().selected).toEqual([]);
    expect(latest().isAllSelected).toEqual(false);
    expect(latest().handleSelect).toBeInstanceOf(Function);
    expect(latest().setSelected).toBeInstanceOf(Function);
  });

  test('prune keeps selection and re-points it at the refreshed rows', () => {
    const running = { id: '1', status: 'running' };
    const successful = { id: '1', status: 'successful' };
    const dropped = { id: '2', status: 'running' };
    const view = testHook([running, dropped], [running, dropped], true);

    expect(latest().selected).toEqual([running, dropped]);

    view.rerender(
      <TestHook
        list={[successful]}
        defaultSelected={[running, dropped]}
        prune
      />
    );

    expect(latest().selected).toEqual([successful]);
    expect(latest().selected[0]).toBe(successful);
    expect((latest().selected[0] as typeof successful).status).toBe(
      'successful'
    );
  });

  test('handleSelect should update and filter selected items', () => {
    testHook();

    act(() => {
      latest().handleSelect(array[0] as Selectable);
    });
    expect(latest().selected).toEqual([array[0]]);

    act(() => {
      latest().handleSelect(array[0] as Selectable);
    });
    expect(latest().selected).toEqual([]);
  });

  test('should return expected isAllSelected value', () => {
    testHook(array);

    act(() => {
      latest().handleSelect(array[0] as Selectable);
    });
    expect(latest().selected).toEqual([array[0]]);
    expect(latest().isAllSelected).toEqual(false);

    act(() => {
      latest().handleSelect(array[1] as Selectable);
    });
    act(() => {
      latest().handleSelect(array[2] as Selectable);
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
