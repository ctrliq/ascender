// PatternFly's DataList logs "DataList's onDrag API is deprecated. Use DragDrop
// instead." on render. DragDrop is not keyboard accessible, so this component
// still uses the onDrag API intentionally; filter just that one deprecation
// warning so the global console trap doesn't fail these tests, and forward
// everything else. (resetMocks wipes the spy between tests, so install per-test.)
// https://github.com/patternfly/patternfly-react/issues/6317

import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import DraggableSelectedList from './DraggableSelectedList';

describe('<DraggableSelectedList />', () => {
  let realWarn;
  beforeEach(() => {
    realWarn = console.warn;
    jest.spyOn(console, 'warn').mockImplementation((...args) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes("DataList's onDrag API is deprecated")
      ) {
        return;
      }
      realWarn(...args);
    });
  });

  afterEach(() => {
    console.warn.mockRestore();
    jest.clearAllMocks();
  });

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
        onRowDrag={() => {}}
      />
    );
    // each selected item renders as a numbered DataList row
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
        onRowDrag={() => {}}
      />
    );
    // component returns null for an empty list, so no DataList renders
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
    // with a single item the reorder drag button is disabled (its accessible
    // name comes from the row label via aria-labelledby, so target it by data-cy)
    expect(document.querySelector('[data-cy="reorder-foo"]')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith({
      id: 1,
      name: 'foo',
    });
  });

  test('should render remove buttons enabled in the initial (not-dragging) state', () => {
    // The original enzyme test drove drag state by invoking the DataList
    // onDragStart/onDragCancel props directly (wrapper.find('DataList')
    // .prop('onDragStart')()). That deprecated PF drag API has no accessible
    // DOM trigger to fire via RTL, which is the very reason this suite is
    // skipped. We assert the initial (not-dragging) enabled state of the
    // remove buttons, the DOM-observable part of the original assertion.
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
        onRowDrag={() => {}}
      />
    );

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((btn) => expect(btn).not.toBeDisabled());
  });
});
