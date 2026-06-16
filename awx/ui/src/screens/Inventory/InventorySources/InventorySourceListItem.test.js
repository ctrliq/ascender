import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventorySourceListItem from './InventorySourceListItem';

const source = {
  id: 1,
  name: 'Foo',
  source: 'Source Bar',
  summary_fields: {
    user_capabilities: { start: true, edit: true },
    last_job: {
      canceled_on: '2020-04-30T18:56:46.054087Z',
      description: '',
      failed: true,
      finished: '2020-04-30T18:56:46.054031Z',
      id: 664,
      license_error: false,
      name: ' Inventory 1 Org 0 - source 4',
      status: 'canceled',
    },
  },
};

function renderItem(props) {
  return renderWithContexts(
    <table>
      <tbody>
        <InventorySourceListItem
          source={source}
          isSelected={false}
          onSelect={() => {}}
          label="Source Bar"
          rowIndex={0}
          {...props}
        />
      </tbody>
    </table>
  );
}

describe('<InventorySourceListItem />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should mount properly', () => {
    renderItem();
    expect(screen.getByText('Foo')).toBeInTheDocument();
  });

  test('all buttons and text fields should render properly', () => {
    renderItem();
    // StatusLabel rendered inside a link to the last job
    expect(screen.getByText('Canceled')).toBeInTheDocument();
    const jobLink = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === '/jobs/inventory/664');
    expect(jobLink).toBeDefined();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    const row = screen.getByText('Foo').closest('tr');
    const cells = within(row).getAllByRole('cell');
    const nameCell = cells.find((c) => c.getAttribute('data-label') === 'Name');
    const typeCell = cells.find((c) => c.getAttribute('data-label') === 'Type');
    expect(nameCell).toHaveTextContent('Foo');
    expect(typeCell).toHaveTextContent('Source Bar');
    // Sync button (InventorySourceSyncButton) + edit pencil link
    expect(screen.getByRole('link', { name: 'Edit Source' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start sync source' })
    ).toBeInTheDocument();
  });

  test('item should be checked', () => {
    renderItem({ isSelected: true });
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('should not render status icon', () => {
    renderItem({
      source: {
        ...source,
        summary_fields: {
          user_capabilities: { start: true, edit: true },
          last_job: null,
        },
      },
    });
    expect(screen.queryByText('Canceled')).not.toBeInTheDocument();
  });

  test('should not render sync buttons', () => {
    renderItem({
      source: {
        ...source,
        summary_fields: {
          user_capabilities: { start: false, edit: true },
        },
      },
      label: undefined,
    });
    expect(
      screen.queryByRole('button', { name: 'Start sync source' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Source' })).toBeInTheDocument();
  });

  test('should not render edit buttons', () => {
    renderItem({
      source: {
        ...source,
        summary_fields: {
          user_capabilities: { start: true, edit: false },
        },
      },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit Source' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start sync source' })
    ).toBeInTheDocument();
  });

  test('should render cancel button while job is running', () => {
    renderItem({
      source: {
        ...source,
        status: 'running',
        summary_fields: {
          ...source.summary_fields,
          current_job: {
            id: 1000,
            status: 'running',
          },
        },
        execution_environment: null,
      },
    });
    expect(
      screen.getByRole('button', { name: 'Cancel Inventory Source Sync' })
    ).toBeInTheDocument();
  });
});
