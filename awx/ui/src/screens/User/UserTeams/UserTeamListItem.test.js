import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserTeamListItem from './UserTeamListItem';

describe('<UserTeamListItem />', () => {
  test('should render item', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserTeamListItem
            team={{
              id: 1,
              name: 'Team 1',
              description: 'something something team',
              summary_fields: {
                organization: {
                  id: 2,
                  name: 'The Org',
                },
              },
            }}
            detailUrl="/team/1"
            isSelected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>
    );

    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(4);
    expect(cells[1].textContent).toEqual('Team 1');
    expect(cells[2].textContent).toEqual('The Org');
    expect(cells[3].textContent).toEqual('something something team');
  });
});
