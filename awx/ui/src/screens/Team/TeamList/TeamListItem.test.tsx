import React from 'react';
import { screen } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import TeamListItem from './TeamListItem';

const renderItem = (capabilities = { edit: true }) =>
  renderWithContexts(
    <table>
      <tbody>
        <TeamListItem
          team={{
            id: 1,
            name: 'Team 1',
            summary_fields: { user_capabilities: capabilities },
          }}
          detailUrl="/team/1"
          isSelected
          onSelect={() => {}}
          rowIndex={0}
        />
      </tbody>
    </table>
  );

describe('<TeamListItem />', () => {
  test('initially renders successfully', () => {
    renderItem();
    expect(screen.getByText('Team 1')).toBeInTheDocument();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem({ edit: true });
    expect(screen.getByLabelText('Edit Team')).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem({ edit: false });
    expect(screen.queryByLabelText('Edit Team')).not.toBeInTheDocument();
  });
});
