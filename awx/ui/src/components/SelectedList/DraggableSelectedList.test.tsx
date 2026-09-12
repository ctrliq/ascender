import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import DraggableSelectedList from './DraggableSelectedList';

describe('<DraggableSelectedList />', () => {
  test('should render expected rows', () => {
    const mockSelected = [
      {
        id: 1,
        name: 'foo',
      },
      {
        id: 2,
        name: 'bar',
      },
    ];
    renderWithContexts(
      <DraggableSelectedList selected={mockSelected} onRemove={() => {}} />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('1. foo')).toBeInTheDocument();
    expect(screen.getByText('2. bar')).toBeInTheDocument();
  });

  test('should not render when selected list is empty', () => {
    renderWithContexts(
      <DraggableSelectedList selected={[]} onRemove={() => {}} />
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('should call onRemove callback prop on remove button click', async () => {
    const onRemove = vi.fn();
    const mockSelected = [
      {
        id: 1,
        name: 'foo',
      },
    ];
    const { user } = renderWithContexts(
      <DraggableSelectedList selected={mockSelected} onRemove={onRemove} />
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith({
      id: 1,
      name: 'foo',
    });
  });

  test('should render remove buttons enabled', () => {
    const mockSelected = [
      {
        id: 1,
        name: 'foo',
      },
      {
        id: 2,
        name: 'bar',
      },
    ];
    renderWithContexts(
      <DraggableSelectedList selected={mockSelected} onRemove={() => {}} />
    );

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  describe('reordering', () => {
    const mockSelected = [
      { id: 1, name: 'foo' },
      { id: 2, name: 'bar' },
      { id: 3, name: 'baz' },
    ];

    // jsdom starts a drag with no dataTransfer on the event, where a browser
    // always carries one.
    const dataTransfer = () => ({ effectAllowed: '', setData: vi.fn() });

    const renderList = (onRowDrag?: (items: typeof mockSelected) => void) =>
      renderWithContexts(
        <DraggableSelectedList
          selected={mockSelected}
          onRemove={() => {}}
          onRowDrag={onRowDrag}
        />
      );

    const rowFor = (label: string) =>
      screen.getByText(label).closest('li') as HTMLElement;

    const startDrag = (label: string) =>
      fireEvent.dragStart(rowFor(label), { dataTransfer: dataTransfer() });

    test('should render a drag handle per row when reordering is on', () => {
      renderList(vi.fn());
      const handles = screen.getAllByRole('button', { name: /^Reorder / });
      expect(handles).toHaveLength(3);
      handles.forEach((handle) => expect(handle).not.toBeDisabled());
    });

    test('should render no drag handle without an onRowDrag', () => {
      renderList();
      expect(
        screen.queryByRole('button', { name: /^Reorder / })
      ).not.toBeInTheDocument();
    });

    test('should disable the handle when only one row is selected', () => {
      renderWithContexts(
        <DraggableSelectedList
          selected={[{ id: 1, name: 'foo' }]}
          onRemove={() => {}}
          onRowDrag={vi.fn()}
        />
      );
      expect(
        screen.getByRole('button', { name: 'Reorder foo' })
      ).toBeDisabled();
    });

    test('should renumber the rows as one is dragged over another', () => {
      renderList(vi.fn());
      startDrag('1. foo');
      fireEvent.dragOver(rowFor('2. bar'));
      expect(screen.getByText('1. bar')).toBeInTheDocument();
      expect(screen.getByText('2. foo')).toBeInTheDocument();
    });

    test('should hand back the new order when a row is dropped', () => {
      const onRowDrag = vi.fn();
      renderList(onRowDrag);

      startDrag('1. foo');
      fireEvent.dragOver(rowFor('3. baz'));
      fireEvent.drop(rowFor('3. foo'));

      expect(onRowDrag).toHaveBeenCalledTimes(1);
      expect(onRowDrag.mock.calls[0]![0]).toEqual([
        { id: 2, name: 'bar' },
        { id: 3, name: 'baz' },
        { id: 1, name: 'foo' },
      ]);
    });

    test('should put the rows back when a row is let go outside the list', () => {
      const onRowDrag = vi.fn();
      renderList(onRowDrag);

      startDrag('1. foo');
      fireEvent.dragOver(rowFor('2. bar'));
      expect(screen.getByText('2. foo')).toBeInTheDocument();

      // Nothing outside the list is a drop target, so the drag reaches
      // dragEnd having never dropped.
      fireEvent.dragEnd(rowFor('2. foo'));

      expect(screen.getByText('1. foo')).toBeInTheDocument();
      expect(onRowDrag).not.toHaveBeenCalled();
    });

    test('should reorder from the keyboard', async () => {
      const onRowDrag = vi.fn();
      const { user } = renderList(onRowDrag);

      const handle = screen.getByRole('button', { name: 'Reorder foo' });
      handle.focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowDown}');
      expect(screen.getByText('2. foo')).toBeInTheDocument();

      await user.keyboard(' ');
      expect(onRowDrag).toHaveBeenCalledTimes(1);
      expect(onRowDrag.mock.calls[0]![0]).toEqual([
        { id: 2, name: 'bar' },
        { id: 1, name: 'foo' },
        { id: 3, name: 'baz' },
      ]);
    });

    test('should cancel a keyboard drag on escape', async () => {
      const onRowDrag = vi.fn();
      const { user } = renderList(onRowDrag);

      const handle = screen.getByRole('button', { name: 'Reorder foo' });
      handle.focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowDown}');
      expect(screen.getByText('2. foo')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.getByText('1. foo')).toBeInTheDocument();
      expect(onRowDrag).not.toHaveBeenCalled();
    });

    test('should not move the top row above itself', async () => {
      const onRowDrag = vi.fn();
      const { user } = renderList(onRowDrag);

      const handle = screen.getByRole('button', { name: 'Reorder foo' });
      handle.focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowUp}');
      expect(screen.getByText('1. foo')).toBeInTheDocument();
    });

    test('should disable the remove buttons while a row is held', () => {
      renderList(vi.fn());
      startDrag('1. foo');
      screen
        .getAllByRole('button', { name: 'Remove' })
        .forEach((btn) => expect(btn).toBeDisabled());
    });
  });
});
