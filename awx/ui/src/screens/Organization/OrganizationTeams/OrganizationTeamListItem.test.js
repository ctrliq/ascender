import React from 'react';
import { screen } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationTeamListItem from './OrganizationTeamListItem';

const buildTeam = (edit = true) => ({
  id: 1,
  name: 'one',
  url: '/org/team/1',
  summary_fields: { user_capabilities: { edit, delete: true } },
});

function renderItem(team) {
  return renderWithContexts(
    <table>
      <tbody>
        <OrganizationTeamListItem team={team} detailUrl="/teams/1" />
      </tbody>
    </table>
  );
}

describe('<OrganizationTeamListItem />', () => {
  test('should mount properly', () => {
    renderItem(buildTeam());
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('should render proper data', () => {
    renderItem(buildTeam());
    expect(screen.getByRole('link', { name: 'one' })).toBeInTheDocument();
    expect(screen.getByLabelText('Edit Team')).toBeInTheDocument();
  });

  test('should not render edit button', () => {
    renderItem(buildTeam(false));
    expect(screen.queryByLabelText('Edit Team')).not.toBeInTheDocument();
  });
});
