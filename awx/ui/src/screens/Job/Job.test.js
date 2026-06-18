import React from 'react';
import { waitForElementToBeRemoved } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Job from './Job';

jest.mock('../../api');
// Job reads useParams from react-router-dom (the route tree is v6);
// mock it there, keeping the rest of the module real.
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({
    id: 1,
    typeSegment: 'project',
  }),
}));

describe('<Job />', () => {
  test('initially renders successfully', async () => {
    const { container } = renderWithContexts(<Job setBreadcrumb={() => {}} />);
    // The auto-mocked api makes the initial fetch settle (into an error
    // state); wait for the ContentLoading spinner to be removed so the
    // async state update lands inside the test.
    await waitForElementToBeRemoved(() =>
      container.querySelector('[role="progressbar"]')
    );
  });
});
