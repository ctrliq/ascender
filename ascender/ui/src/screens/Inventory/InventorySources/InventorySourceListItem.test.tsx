import type { InventorySource } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { InventoryUpdatesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import InventorySourceListItem from './InventorySourceListItem';

vi.mock('../../../api/models/InventoryUpdates');

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
} as unknown as InventorySource;

// The harness signs in a superuser, whom the api always lets cancel.
const notSuperuser = { config: { me: { id: 2, is_superuser: false } } };

function renderItem(
  props?: Partial<React.ComponentProps<typeof InventorySourceListItem>>,
  options?: Parameters<typeof renderWithContexts>[1]
) {
  return renderWithContexts(
    <table>
      <tbody>
        <InventorySourceListItem
          source={source}
          isSelected={false}
          onSelect={() => {}}
          detailUrl="/inventories/inventory/1/sources/1/details"
          label="Source Bar"
          rowIndex={0}
          {...props}
        />
      </tbody>
    </table>,
    options
  );
}

describe('<InventorySourceListItem />', () => {
  afterEach(() => {
    vi.clearAllMocks();
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
      .find((link) => link.getAttribute('href') === '/runs/inventory/664');
    expect(jobLink).toBeDefined();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    const row = screen.getByText('Foo').closest('tr');
    const cells = within(row!).getAllByRole('cell');
    const nameCell = cells.find((c) => c.getAttribute('data-label') === 'Name');
    const typeCell = cells.find((c) => c.getAttribute('data-label') === 'Type');
    expect(nameCell).toHaveTextContent('Foo');
    expect(typeCell).toHaveTextContent('Source Bar');
    // Sync button (InventorySourceSyncButton) + edit pencil link
    expect(
      screen.getByRole('link', { name: 'Edit Source' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sync Source' })
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
          last_job: undefined,
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
      screen.queryByRole('button', { name: 'Sync Source' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Edit Source' })
    ).toBeInTheDocument();
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
      screen.getByRole('button', { name: 'Sync Source' })
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
      screen.getByRole('button', { name: 'Cancel Inventory Sync' })
    ).toBeInTheDocument();
  });

  // A new sync has not reached a node yet, and the api still lets it go.
  test('should render cancel button for a sync not yet started', () => {
    renderItem({
      source: {
        ...source,
        status: 'pending',
        summary_fields: {
          ...source.summary_fields,
          current_job: { id: 1000, status: 'new' },
        },
      },
    });
    expect(
      screen.getByRole('button', { name: 'Cancel Inventory Sync' })
    ).toBeInTheDocument();
  });

  /*
   * Starting a sync is not the right the api checks on cancel. Someone who
   * may sync but did not start this run, and is no admin of the inventory,
   * is refused, so neither Cancel nor Sync is offered while it runs.
   */
  test('should not offer cancel to a user the api would refuse', async () => {
    vi.mocked(InventoryUpdatesAPI.readDetail).mockResolvedValue({
      data: { summary_fields: { user_capabilities: { cancel: false } } },
    } as unknown as ResponseOf<typeof InventoryUpdatesAPI.readDetail>);
    renderItem(
      {
        source: {
          ...source,
          summary_fields: {
            ...source.summary_fields,
            user_capabilities: { start: true, edit: false },
            current_job: { id: 1000, status: 'running' },
          },
        },
      },
      { context: notSuperuser }
    );
    await waitFor(() =>
      expect(InventoryUpdatesAPI.readDetail).toHaveBeenCalledWith(1000)
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel Inventory Sync' })
    ).not.toBeInTheDocument();
  });

  test('should offer cancel to the user who started the sync', async () => {
    vi.mocked(InventoryUpdatesAPI.readDetail).mockResolvedValue({
      data: { summary_fields: { user_capabilities: { cancel: true } } },
    } as unknown as ResponseOf<typeof InventoryUpdatesAPI.readDetail>);
    renderItem(
      {
        source: {
          ...source,
          summary_fields: {
            ...source.summary_fields,
            user_capabilities: { start: true, edit: false },
            current_job: { id: 1000, status: 'running' },
          },
        },
      },
      { context: notSuperuser }
    );
    expect(
      await screen.findByRole('button', {
        name: 'Cancel Inventory Sync',
      })
    ).toBeInTheDocument();
  });
});
