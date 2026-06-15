import React from 'react';
import { act } from 'react-dom/test-utils';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';

import Job from './Job';

jest.mock('../../api');
// Job reads useParams from react-router-dom-v5-compat (the route tree is v6);
// mock it there, keeping the rest of the module real.
jest.mock('react-router-dom-v5-compat', () => ({
  ...jest.requireActual('react-router-dom-v5-compat'),
  useParams: () => ({
    id: 1,
    typeSegment: 'project',
  }),
}));

describe('<Job />', () => {
  test('initially renders successfully', async () => {
    await act(async () => {
      await mountWithContexts(<Job setBreadcrumb={() => {}} />);
    });
  });
});
