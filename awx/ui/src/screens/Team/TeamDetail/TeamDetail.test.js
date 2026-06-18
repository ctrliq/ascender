import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { TeamsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import TeamDetail from './TeamDetail';

jest.mock('../../../api');

const makeTeam = ({ summary_fields, ...overrides } = {}) => ({
  name: 'Foo',
  description: 'Bar',
  created: '2015-07-07T17:21:26.429745Z',
  modified: '2019-08-11T19:47:37.980466Z',
  ...overrides,
  summary_fields: {
    organization: { id: 1, name: 'Default' },
    user_capabilities: { edit: true, delete: true },
    ...(summary_fields || {}),
  },
});

describe('<TeamDetail />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render the details', async () => {
    renderWithContexts(<TeamDetail team={makeTeam()} />);
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    assertDetail('Name', 'Foo');
    assertDetail('Description', 'Bar');
    assertDetail('Organization', 'Default');
    assertDetail('Created', '7/7/2015, 5:21:26 PM');
    assertDetail('Last Modified', '8/11/2019, 7:47:37 PM');
    expect(screen.getByLabelText('Edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should hide the edit button without edit permission', async () => {
    renderWithContexts(
      <TeamDetail
        team={makeTeam({
          summary_fields: {
            organization: { id: 1, name: 'Default' },
            user_capabilities: { edit: false, delete: true },
          },
        })}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });

  test('expected api call is made for delete', async () => {
    const { user } = renderWithContexts(<TeamDetail team={makeTeam()} />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('Confirm Delete'));
    await waitFor(() => expect(TeamsAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('shows an error dialog for a failed deletion', async () => {
    TeamsAPI.destroy.mockRejectedValue(new Error('nope'));
    const { user } = renderWithContexts(<TeamDetail team={makeTeam()} />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('Confirm Delete'));
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });
});
