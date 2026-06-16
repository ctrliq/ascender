import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationListItem from './OrganizationListItem';

function renderItem(edit) {
  return renderWithContexts(
    <table>
      <tbody>
        <OrganizationListItem
          organization={{
            id: 1,
            name: 'Org',
            summary_fields: {
              related_field_counts: {
                users: 1,
                teams: 1,
              },
              user_capabilities: {
                edit,
              },
            },
          }}
          detailUrl="/organization/1"
          isSelected
          onSelect={() => {}}
        />
      </tbody>
    </table>
  );
}

describe('<OrganizationListItem />', () => {
  test('initially renders successfully', () => {
    renderItem(true);
    expect(screen.getByRole('row')).toBeInTheDocument();
    expect(screen.getByText('Org')).toBeInTheDocument();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(true);
    expect(screen.getByLabelText('Edit Organization')).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem(false);
    expect(screen.queryByLabelText('Edit Organization')).not.toBeInTheDocument();
  });
});
