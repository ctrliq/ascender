import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import HostsListItem from './HostListItem';

const mockHost = {
  id: 1,
  name: 'Host 1',
  url: '/api/v2/hosts/1',
  description: 'Buzz',
  inventory: 1,
  enabled: true,
  summary_fields: {
    inventory: {
      id: 1,
      name: 'Inv 1',
    },
    user_capabilities: {
      edit: true,
    },
    recent_jobs: [],
  },
};

function renderItem(host) {
  return renderWithContexts(
    <table>
      <tbody>
        <HostsListItem
          isSelected={false}
          detailUrl="/host/1"
          onSelect={() => {}}
          host={host}
        />
      </tbody>
    </table>
  );
}

describe('<HostsListItem />', () => {
  test('should display expected details', () => {
    renderItem(mockHost);
    const nameLink = screen.getByRole('link', { name: 'Host 1' });
    expect(nameLink).toHaveAttribute('href', '/host/1');

    const row = nameLink.closest('tr');
    const descriptionCell = within(row)
      .getAllByRole('cell')
      .find((cell) => cell.getAttribute('data-label') === 'Description');
    expect(descriptionCell).toHaveTextContent('Buzz');
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(mockHost);
    expect(
      screen.getByRole('link', { name: 'Edit Host' })
    ).toHaveAttribute('href', '/hosts/1/edit');
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem({
      ...mockHost,
      summary_fields: {
        ...mockHost.summary_fields,
        user_capabilities: { edit: false },
      },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit Host' })
    ).not.toBeInTheDocument();
  });

  test('should display host toggle', () => {
    renderItem(mockHost);
    expect(
      screen.getByRole('switch', { name: 'Toggle host' })
    ).toBeInTheDocument();
  });
});
