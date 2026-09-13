import type { HostFormValues } from 'components/HostForm/HostForm';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { HostsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { MockHandlerFormProps } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import HostAdd from './HostAdd';

vi.mock('../../../api');

declare global {
  /**
   * What the stubbed host form below submits. It lives on the global
   * because a vi.mock factory may not close over a local.
   */
  // eslint-disable-next-line vars-on-top
  var __hostFormSubmitData: Partial<HostFormValues> | undefined;
}

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

describe('<HostAdd />', () => {
  let history: TestHistory;

  beforeEach(() => {
    global.__hostFormSubmitData = hostData;
    history = createMemoryHistory({
      initialEntries: ['/templates/job_templates/1/survey/edit/foo'],
      state: { some: 'state' },
    });
    vi.mocked(HostsAPI.create).mockResolvedValue({
      data: {
        ...hostData,
        id: 5,
      },
    } as unknown as ResponseOf<typeof HostsAPI.create>);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      expect(HostsAPI.create).toHaveBeenCalledWith({
        ...hostData,
        inventory: 1,
      })
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
    vi.mocked(HostsAPI.create).mockImplementationOnce(() =>
      Promise.reject(error)
    );
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('FormSubmitError')).toBeInTheDocument();
  });
});
