import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';

import TeamListItem from './TeamListItem';

describe('<TeamListItem />', () => {
  test('initially renders successfully', () => {
    mountWithContexts(
      <MemoryRouter initialEntries={['/teams']} initialIndex={0}>
        <table>
          <tbody>
            <TeamListItem
              team={{
                id: 1,
                name: 'Team 1',
                summary_fields: {
                  user_capabilities: {
                    edit: true,
                  },
                },
              }}
              detailUrl="/team/1"
              isSelected
              onSelect={() => {}}
            />
          </tbody>
        </table>
      </MemoryRouter>
    );
  });
  test('edit button shown to users with edit capabilities', () => {
    const wrapper = mountWithContexts(
      <MemoryRouter initialEntries={['/teams']} initialIndex={0}>
        <table>
          <tbody>
            <TeamListItem
              team={{
                id: 1,
                name: 'Team',
                summary_fields: {
                  user_capabilities: {
                    edit: true,
                  },
                },
              }}
              detailUrl="/team/1"
              isSelected
              onSelect={() => {}}
            />
          </tbody>
        </table>
      </MemoryRouter>
    );
    expect(wrapper.find('PencilAltIcon').exists()).toBeTruthy();
  });
  test('edit button hidden from users without edit capabilities', () => {
    const wrapper = mountWithContexts(
      <MemoryRouter initialEntries={['/teams']} initialIndex={0}>
        <table>
          <tbody>
            <TeamListItem
              team={{
                id: 1,
                name: 'Team',
                summary_fields: {
                  user_capabilities: {
                    edit: false,
                  },
                },
              }}
              detailUrl="/team/1"
              isSelected
              onSelect={() => {}}
            />
          </tbody>
        </table>
      </MemoryRouter>
    );
    expect(wrapper.find('PencilAltIcon').exists()).toBeFalsy();
  });
});