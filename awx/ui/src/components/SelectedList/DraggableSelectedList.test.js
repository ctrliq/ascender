import React from 'react';
import { screen } from '@testing-library/react';
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
      <DraggableSelectedList
        selected={mockSelected}
        onRemove={() => {}}
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('1. foo')).toBeInTheDocument();
    expect(screen.getByText('2. bar')).toBeInTheDocument();
  });

  test('should not render when selected list is empty', () => {
    renderWithContexts(
      <DraggableSelectedList
        selected={[]}
        onRemove={() => {}}
      />
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('should call onRemove callback prop on remove button click', async () => {
    const onRemove = jest.fn();
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
      <DraggableSelectedList
        selected={mockSelected}
        onRemove={() => {}}
      />
    );

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((btn) => expect(btn).not.toBeDisabled());
  });
});
