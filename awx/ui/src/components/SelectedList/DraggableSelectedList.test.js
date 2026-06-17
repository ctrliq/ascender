// These tests have been turned off because they fail due to a console
// warning coming from patternfly. The warning is that the onDrag api has been
// deprecated. Its replacement is a DragDrop component, however that component
// is not keyboard accessible. Therefore we have elected to turn off these
// tests.
// https://github.com/patternfly/patternfly-react/issues/6317

import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import DraggableSelectedList from './DraggableSelectedList';

describe.skip('<DraggableSelectedList />', () => {
  afterEach(() => {
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
    // with a single item the reorder drag button is disabled
    expect(
      screen.getByRole('button', { name: 'Reorder' })
    ).toBeDisabled();
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
