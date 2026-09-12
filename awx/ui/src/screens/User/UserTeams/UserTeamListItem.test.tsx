import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserTeamListItem from './UserTeamListItem';
import type { Team } from '../../../types/api';

describe('<UserTeamListItem />', () => {
  test('should render item', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserTeamListItem
            rowIndex={0}
            team={
              {
                id: 1,
                name: 'Team 1',
                description: 'something something team',
                summary_fields: {
                  organization: {
                    id: 2,
                    name: 'The Org',
                  },
                },
              } as unknown as Team
            }
            detailUrl="/team/1"
            isSelected={false}
            onSelect={() => {}}
          />
        </tbody>
      </table>
    );

    // The leading cell is the row's checkbox, then name, organization and
    // description.
    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(4);
    expect(cells[1]!.textContent).toEqual('Team 1');
    expect(cells[2]!.textContent).toEqual('The Org');
    expect(cells[3]!.textContent).toEqual('something something team');
  });
});
