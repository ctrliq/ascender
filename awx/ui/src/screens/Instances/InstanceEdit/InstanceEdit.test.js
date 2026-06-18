import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import useDebounce from 'hooks/useDebounce';
import { InstancesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceEdit from './InstanceEdit';

jest.mock('../../../api');
jest.mock('../../../hooks/useDebounce');
// The component reads useParams from react-router-dom-v5-compat (the route
// tree is v6); mock it there, keeping the rest of the module real.
jest.mock('react-router-dom-v5-compat', () => ({
  ...jest.requireActual('react-router-dom-v5-compat'),
  useParams: () => ({
    id: 42,
  }),
}));

const updatedInstance = {
  node_type: 'hop',
  peers: ['test-peer'],
};

// Stub the shared form: it surfaces the container's handleSubmit/handleCancel
// through real buttons and renders the submit error so we can assert on it.
jest.mock('../Shared/InstanceForm', () => {
  const MockForm = ({ handleSubmit, handleCancel, submitError }) => (
    <div>
      <button
        type="button"
        aria-label="Save"
        onClick={() => handleSubmit({ node_type: 'hop', peers: ['test-peer'] })}
      >
        Save
      </button>
      <button type="button" aria-label="Cancel" onClick={handleCancel}>
        Cancel
      </button>
      {submitError ? <div data-testid="form-submit-error">error</div> : null}
    </div>
  );
  return MockForm;
});

const instanceData = {
  id: 42,
  hostname: 'awx_1',
  type: 'instance',
  url: '/api/v2/instances/1/',
  related: {
    named_url: '/api/v2/instances/awx_1/',
    jobs: '/api/v2/instances/1/jobs/',
    instance_groups: '/api/v2/instances/1/instance_groups/',
    peers: '/api/v2/instances/1/peers/',
  },
  summary_fields: {
    user_capabilities: {
      edit: false,
    },
    links: [],
  },
  uuid: '00000000-0000-0000-0000-000000000000',
  node_type: 'hybrid',
  node_state: 'installed',
  enabled: true,
};

const instanceDataWithPeers = {
  results: [instanceData],
};

describe('<InstanceEdit/>', () => {
  let history;

  beforeEach(() => {
    useDebounce.mockImplementation((fn) => fn);
    history = createMemoryHistory();
    InstancesAPI.readDetail.mockResolvedValue({ data: instanceData });
    InstancesAPI.readPeers.mockResolvedValue({ data: instanceDataWithPeers });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully and fetches detail', async () => {
    renderWithContexts(<InstanceEdit setBreadcrumb={() => {}} />, {
      context: { router: { history } },
    });

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(InstancesAPI.readDetail).toHaveBeenCalledWith(42);
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    InstancesAPI.update.mockResolvedValue({});
    const { user } = renderWithContexts(
      <InstanceEdit setBreadcrumb={() => {}} />,
      {
        context: { router: { history } },
      }
    );

    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(InstancesAPI.update).toHaveBeenCalledWith(42, updatedInstance)
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/instances/42/details')
    );
  });

  test('should navigate to instance details when cancel is clicked', async () => {
    const { user } = renderWithContexts(
      <InstanceEdit setBreadcrumb={() => {}} />,
      {
        context: { router: { history } },
      }
    );

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/instances/42/details');
  });

  test('successful submission should not show an error message', async () => {
    InstancesAPI.update.mockResolvedValue({});
    const { user } = renderWithContexts(
      <InstanceEdit setBreadcrumb={() => {}} />,
      {
        context: { router: { history } },
      }
    );

    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual('/instances/42/details')
    );
    expect(screen.queryByTestId('form-submit-error')).not.toBeInTheDocument();
  });

  test('failed form submission should show an error message', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    InstancesAPI.update.mockImplementationOnce(() => Promise.reject(error));
    const { user } = renderWithContexts(
      <InstanceEdit setBreadcrumb={() => {}} />,
      {
        context: { router: { history } },
      }
    );

    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });
});
