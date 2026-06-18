import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import HostAdd from './HostAdd';

jest.mock('../../../api');

const hostData = {
  name: 'new name',
  description: 'new description',
  inventory: {
    id: 1,
    name: 'Demo Inventory',
  },
  variables: '---\nfoo: bar',
};

// Mock the shared HostForm: a Save button invokes handleSubmit with the
// provided test payload, a Cancel button invokes handleCancel, and the
// submitError prop renders so the error branch can be asserted.
jest.mock('components/HostForm', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: ({ handleSubmit, handleCancel, submitError }) =>
      ReactLib.createElement(
        'div',
        null,
        ReactLib.createElement(
          'button',
          {
            type: 'button',
            'aria-label': 'Save',
            onClick: () => handleSubmit(global.__hostFormSubmitData),
          },
          'Save'
        ),
        ReactLib.createElement(
          'button',
          { type: 'button', 'aria-label': 'Cancel', onClick: handleCancel },
          'Cancel'
        ),
        submitError
          ? ReactLib.createElement('div', null, 'FormSubmitError')
          : null
      ),
  };
});

describe('<HostAdd />', () => {
  let history;

  beforeEach(() => {
    global.__hostFormSubmitData = hostData;
    history = createMemoryHistory({
      initialEntries: ['/templates/job_templates/1/survey/edit/foo'],
      state: { some: 'state' },
    });
    HostsAPI.create.mockResolvedValue({
      data: {
        ...hostData,
        id: 5,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function render() {
    return renderWithContexts(<HostAdd />, {
      context: { router: { history } },
    });
  }

  test('handleSubmit should post to api', async () => {
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(HostsAPI.create).toHaveBeenCalledWith({ ...hostData, inventory: 1 })
    );
  });

  test('should navigate to hosts list when cancel is clicked', async () => {
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/hosts');
  });

  test('successful form submission should trigger redirect', async () => {
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/hosts/5/details')
    );
    expect(screen.queryByText('FormSubmitError')).not.toBeInTheDocument();
  });

  test('failed form submission should show an error message', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    HostsAPI.create.mockImplementationOnce(() => Promise.reject(error));
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('FormSubmitError')).toBeInTheDocument();
  });
});
