import React from 'react';
import { screen, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Applications from './Applications';

jest.mock('../../api/models/Applications');
jest.mock('../../api/models/Organizations');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('./ApplicationsList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ApplicationsList'),
  };
});
jest.mock('./ApplicationAdd', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: ({ onSuccessfulAdd }) =>
      ReactLib.createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            onSuccessfulAdd({
              name: 'test',
              client_id: 'foobar',
              client_secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaa',
            }),
        },
        'simulate successful add'
      ),
  };
});
jest.mock('./Application', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Application detail'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/applications/*" element={<Applications />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<Applications />', () => {
  test('renders the list at /applications', async () => {
    renderAt('/applications');
    expect(await screen.findByText('ApplicationsList')).toBeInTheDocument();
  });

  test('renders the add form at /applications/add', async () => {
    renderAt('/applications/add');
    expect(
      await screen.findByRole('button', { name: 'simulate successful add' })
    ).toBeInTheDocument();
    expect(screen.queryByText('ApplicationsList')).not.toBeInTheDocument();
  });

  test('renders the detail subtree at /applications/:id', async () => {
    renderAt('/applications/5/details');
    expect(await screen.findByText('Application detail')).toBeInTheDocument();
    expect(screen.queryByText('ApplicationsList')).not.toBeInTheDocument();
  });

  test('shows the information modal after a successful creation', async () => {
    const { user } = renderAt('/applications/add');
    expect(
      screen.queryByRole('dialog', { name: /Application information/ })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'simulate successful add' })
    );

    const dialog = await screen.findByRole('dialog', {
      name: /Application information/,
    });
    // the name renders as a plain Detail value (client_id/secret sit inside
    // collapsed ClipboardCopy expansions, so they are not queried here)
    expect(within(dialog).getByText('test')).toBeInTheDocument();
  });
});
