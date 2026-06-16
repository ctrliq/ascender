import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockHost from '../data.host.json';
import HostEdit from './HostEdit';

jest.mock('../../../api');

const updatedHostData = {
  name: 'new name',
  description: 'new description',
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

describe('<HostEdit />', () => {
  let history;

  beforeEach(() => {
    global.__hostFormSubmitData = updatedHostData;
    history = createMemoryHistory();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function render() {
    return renderWithContexts(<HostEdit host={mockHost} />, {
      context: { router: { history } },
    });
  }

  test('handleSubmit should call api update', async () => {
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(HostsAPI.update).toHaveBeenCalledWith(2, updatedHostData)
    );
  });

  test('should navigate to host detail when cancel is clicked', async () => {
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/hosts/2/details');
  });

  test('should navigate to host detail after successful submission', async () => {
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/hosts/2/details')
    );
    expect(screen.queryByText('FormSubmitError')).not.toBeInTheDocument();
  });

  test('failed form submission should show an error message', async () => {
    global.__hostFormSubmitData = mockHost;
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    HostsAPI.update.mockImplementationOnce(() => Promise.reject(error));
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('FormSubmitError')).toBeInTheDocument();
  });
});
