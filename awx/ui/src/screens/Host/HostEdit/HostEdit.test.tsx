import type { Host } from 'types/api';
import type { HostFormValues } from 'components/HostForm/HostForm';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { HostsAPI } from 'api';
import type { MockHandlerFormProps } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockHost from '../data.host.json';
import HostEdit from './HostEdit';

vi.mock('../../../api');

declare global {
  /**
   * What the stubbed host form below submits. It lives on the global
   * because a vi.mock factory may not close over a local.
   */
  // eslint-disable-next-line vars-on-top
  var __hostFormSubmitData: Partial<HostFormValues> | undefined;
}

const updatedHostData = {
  name: 'new name',
  description: 'new description',
  variables: '---\nfoo: bar',
};

// Mock the shared HostForm: a Save button invokes handleSubmit with the
// provided test payload, a Cancel button invokes handleCancel, and the
// submitError prop renders so the error branch can be asserted.
vi.mock('components/HostForm', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({
      handleSubmit,
      handleCancel,
      submitError,
    }: MockHandlerFormProps) =>
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
  let history: TestHistory;

  beforeEach(() => {
    global.__hostFormSubmitData = updatedHostData;
    history = createMemoryHistory();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function render() {
    return renderWithContexts(<HostEdit host={mockHost as unknown as Host} />, {
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
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    vi.mocked(HostsAPI.update).mockImplementationOnce(() =>
      Promise.reject(error)
    );
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('FormSubmitError')).toBeInTheDocument();
  });
});
