import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import HostGroups from './HostGroups';

jest.mock('./HostGroupsList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'HostGroupsList'),
  };
});

const host = {
  id: 1,
  name: 'Foo',
  summary_fields: { inventory: { id: 1 } },
};

// HostGroups uses paths relative to its parent route, so mount it under the
// same /hosts/:id/groups/* route that Host.js gives it in the app.
function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/hosts/:id/groups/*"
        element={<HostGroups setBreadcrumb={() => {}} host={host} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<HostGroups />', () => {
  test('renders the host groups list at the index path', async () => {
    renderAt('/hosts/1/groups');
    expect(await screen.findByText('HostGroupsList')).toBeInTheDocument();
  });
});
