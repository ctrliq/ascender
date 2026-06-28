import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { ApplicationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import Application from './Application';

jest.mock('../../../api/models/Applications');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
jest.mock('../ApplicationDetails', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ApplicationDetails'),
  };
});
jest.mock('../ApplicationEdit', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ApplicationEdit'),
  };
});
jest.mock('../ApplicationTokens', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ApplicationTokens'),
  };
});

const options = {
  data: {
    actions: {
      GET: {
        client_type: {
          choices: [
            ['confidential', 'Confidential'],
            ['public', 'Public'],
          ],
        },
        authorization_grant_type: {
          choices: [
            ['authorization-code', 'Authorization code'],
            ['password', 'Resource owner password-based'],
          ],
        },
      },
    },
  },
};
const application = {
  id: 1,
  name: 'Foo',
  summary_fields: {
    organization: { name: 'Org 1', id: 10 },
    user_capabilities: { edit: true, delete: true },
  },
  url: '',
  organization: 10,
};

// Application uses paths relative to its parent route, so mount it under the
// same /applications/:id/* route that Applications.js gives it in the app.
function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/applications/:id/*"
        element={<Application setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Application />', () => {
  beforeEach(() => {
    ApplicationsAPI.readOptions.mockResolvedValue(options);
    ApplicationsAPI.readDetail.mockResolvedValue({ data: application });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('fetches the application detail and options', async () => {
    renderAt('/applications/1/details');
    expect(await screen.findByText('ApplicationDetails')).toBeInTheDocument();
    expect(ApplicationsAPI.readOptions).toHaveBeenCalled();
    // real route params are strings (route params are always strings under react-router)
    expect(ApplicationsAPI.readDetail).toHaveBeenCalledWith('1');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/applications/1/edit');
    expect(await screen.findByText('ApplicationEdit')).toBeInTheDocument();
  });

  test('renders the tokens panel at /tokens', async () => {
    renderAt('/applications/1/tokens');
    expect(await screen.findByText('ApplicationTokens')).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/applications/1');
    expect(await screen.findByText('ApplicationDetails')).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/applications/1/details')
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = new Error('not found');
    err.response = { status: 404 };
    ApplicationsAPI.readDetail.mockRejectedValue(err);
    renderAt('/applications/1/details');
    expect(
      await screen.findByText('Application not found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('ApplicationDetails')).not.toBeInTheDocument();
  });
});
