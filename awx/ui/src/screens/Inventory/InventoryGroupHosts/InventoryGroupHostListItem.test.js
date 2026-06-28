import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroupHostListItem from './InventoryGroupHostListItem';
import mockHosts from '../shared/data.hosts.json';

jest.mock('../../../api');

const mockHost = mockHosts.results[0];

// The item reads :inventoryType via useParams; mount under a real v6 route.
function renderItem(url, host = mockHost) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/hosts"
        element={
          <table>
            <tbody>
              <InventoryGroupHostListItem
                detailUrl="/host/1"
                editUrl="/host/1"
                host={host}
                isSelected={false}
                onSelect={() => {}}
                rowIndex={0}
              />
            </tbody>
          </table>
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryGroupHostListItem />', () => {
  const url = '/inventories/inventory/1/groups/2/hosts';

  test('should display expected details', () => {
    renderItem(url);
    const nameLink = screen.getByRole('link', {
      name: mockHost.name,
    });
    expect(nameLink).toHaveAttribute('href', '/host/1');
    expect(
      screen.getByText(mockHost.description)
    ).toBeInTheDocument();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(url, {
      ...mockHost,
      summary_fields: {
        ...mockHost.summary_fields,
        user_capabilities: {
          ...mockHost.summary_fields.user_capabilities,
          edit: true,
        },
      },
    });
    expect(
      screen.getByRole('link', { name: 'Edit Host' })
    ).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem(url, {
      ...mockHost,
      summary_fields: {
        ...mockHost.summary_fields,
        user_capabilities: {
          ...mockHost.summary_fields.user_capabilities,
          edit: false,
        },
      },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit Host' })
    ).not.toBeInTheDocument();
  });
});

describe('<InventoryGroupHostListItem> inside constructed inventories', () => {
  test('Edit button hidden for constructed inventory', () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/constructed_inventory/1/groups/2/hosts'],
    });
    renderWithContexts(
      <Routes>
        <Route
          path="/inventories/:inventoryType/:id/groups/:groupId/hosts"
          element={
            <table>
              <tbody>
                <InventoryGroupHostListItem
                  detailUrl="/host/1"
                  editUrl="/host/1"
                  host={mockHost}
                  isSelected={false}
                  onSelect={() => {}}
                  rowIndex={0}
                />
              </tbody>
            </table>
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );
    expect(
      screen.queryByRole('link', { name: 'Edit Host' })
    ).not.toBeInTheDocument();
  });
});
