import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';

import mockDetails from '../data.user.json';
import UserListItem from './UserListItem';

let wrapper;

describe('UserListItem with full permissions', () => {
  beforeEach(() => {
    wrapper = mountWithContexts(
      <MemoryRouter initialEntries={['/users']} initialIndex={0}>
        <table>
          <tbody>
            <UserListItem
              user={mockDetails}
              detailUrl="/user/1"
              isSelected
              onSelect={() => {}}
            />
          </tbody>
        </table>
      </MemoryRouter>
    );
  });

  test('initially renders successfully', () => {
    expect(wrapper.length).toBe(1);
  });

  test('edit button shown to users with edit capabilities', () => {
    expect(wrapper.find('PencilAltIcon').exists()).toBeTruthy();
  });

  test('should display user data', () => {
    expect(wrapper.find('td[data-label="Role"]').prop('children')).toEqual(
      'System Administrator'
    );
    expect(
      wrapper.find('Label[aria-label="social login"]').prop('children')
    ).toEqual('SOCIAL');
  });
});

describe('UserListItem without full permissions', () => {
  test('edit button hidden from users without edit capabilities', () => {
    wrapper = mountWithContexts(
      <MemoryRouter initialEntries={['/users']} initialIndex={0}>
        <table>
          <tbody>
            <UserListItem
              user={{
                ...mockDetails,
                summary_fields: {
                  user_capabilities: {
                    edit: false,
                  },
                },
              }}
              detailUrl="/user/1"
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
