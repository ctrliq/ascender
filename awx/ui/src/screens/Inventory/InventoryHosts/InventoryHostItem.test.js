import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryHostItem from './InventoryHostItem';

jest.mock('api');

const mockHost = {
  id: 1,
  name: 'Host 1',
  url: '/api/v2/hosts/1',
  description: 'Bar',
  inventory: 1,
  summary_fields: {
    inventory: {
      id: 1,
      name: 'Inv 1',
    },
    user_capabilities: {
      edit: true,
    },
    recent_jobs: [
      {
        id: 123,
        name: 'Demo Job Template',
        status: 'failed',
        finished: '2020-02-26T22:38:41.037991Z',
      },
    ],
    groups: {
      count: 1,
      results: [
        {
          id: 11,
          name: 'group_11',
        },
      ],
    },
  },
};

const getChips = () => {
  const list = screen.getByRole('list', { name: 'Related Groups' });
  const items = within(list).getAllByRole('listitem');
  return items.map((item) => item.textContent);
};

function renderItem(props) {
  const history = createMemoryHistory({
    initialEntries: ['/inventories/inventory/1/hosts'],
  });
  return renderWithContexts(
    <table>
      <tbody>
        <InventoryHostItem
          detailUrl="/host/1"
          editUrl="/inventories/inventory/1/hosts/1/edit"
          host={mockHost}
          isSelected={false}
          onSelect={() => {}}
          {...props}
        />
      </tbody>
    </table>,
    { context: { router: { history } } }
  );
}

describe('<InventoryHostItem />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should display expected details', () => {
    renderItem();

    expect(screen.getByRole('cell', { name: 'Bar' })).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Toggle host' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Host 1' })).toHaveAttribute(
      'href',
      '/host/1'
    );
    expect(screen.getByRole('link', { name: 'Edit host' })).toHaveAttribute(
      'href',
      '/inventories/inventory/1/hosts/1/edit'
    );

    expect(getChips()).toEqual(['group_11']);
  });

  test('edit button hidden from users without edit capabilities', () => {
    const copyMockHost = {
      ...mockHost,
      summary_fields: {
        ...mockHost.summary_fields,
        user_capabilities: { edit: false },
      },
    };

    renderItem({ host: copyMockHost });
    expect(screen.queryByText('Edit host')).not.toBeInTheDocument();
  });

  test('should show and hide related groups on overflow button click', async () => {
    const mockGroups = [
      { id: 1, name: 'group_1' },
      { id: 2, name: 'group_2' },
      { id: 3, name: 'group_3' },
      { id: 4, name: 'group_4' },
      { id: 5, name: 'group_5' },
      { id: 6, name: 'group_6' },
    ];
    const copyMockHost = {
      ...mockHost,
      summary_fields: {
        ...mockHost.summary_fields,
        groups: {
          count: 6,
          results: mockGroups.slice(0, 5),
        },
      },
    };
    HostsAPI.readGroups.mockReturnValue({
      data: { results: mockGroups },
    });

    renderItem({ host: copyMockHost });

    const initialRelatedGroupChips = getChips();
    expect(initialRelatedGroupChips).toEqual([
      'group_1',
      'group_2',
      'group_3',
      'group_4',
      '2 more',
    ]);

    fireEvent.click(screen.getByText('2 more'));

    await waitFor(() => expect(HostsAPI.readGroups).toHaveBeenCalledWith(1));

    expect(getChips()).toEqual([
      'group_1',
      'group_2',
      'group_3',
      'group_4',
      'group_5',
      'group_6',
      'Show less',
    ]);

    fireEvent.click(await screen.findByText('Show less'));
    expect(getChips()).toEqual(initialRelatedGroupChips);
  });

  test('should show error modal when related groups api request fails', async () => {
    const mockGroups = [
      { id: 1, name: 'group_1' },
      { id: 2, name: 'group_2' },
      { id: 3, name: 'group_3' },
      { id: 4, name: 'group_4' },
      { id: 5, name: 'group_5' },
      { id: 6, name: 'group_6' },
    ];
    const copyMockHost = {
      ...mockHost,
      summary_fields: {
        ...mockHost.summary_fields,
        groups: {
          count: 6,
          results: mockGroups.slice(0, 5),
        },
      },
    };
    HostsAPI.readGroups.mockRejectedValueOnce(new Error());

    renderItem({ host: copyMockHost });
    fireEvent.click(screen.getByText('2 more'));

    expect(
      await screen.findByRole('dialog', { name: 'Alert modal Error!' })
    ).toBeInTheDocument();
  });
});
