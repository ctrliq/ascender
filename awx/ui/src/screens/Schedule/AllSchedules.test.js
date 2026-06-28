import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AllSchedules from './AllSchedules';

jest.mock('../../api');

// resetMocks strips jest.fn implementations between tests, so capture the
// props with a plain function instead of asserting on mock.calls.
let mockScreenHeaderProps;
jest.mock('components/ScreenHeader', () => ({
  __esModule: true,
  default: (props) => {
    mockScreenHeaderProps = props;
    return null;
  },
}));

// Marker for the routed list so the assertion is about which branch of the
// v6 <Routes> tree resolves.
jest.mock('components/Schedule', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    ScheduleList: () => ReactLib.createElement('div', null, 'ScheduleList'),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/schedules/*" element={<AllSchedules />} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<AllSchedules />', () => {
  beforeEach(() => {
    mockScreenHeaderProps = undefined;
  });

  test('renders the schedule list and sets the breadcrumb config at /schedules', async () => {
    renderAt('/schedules');
    expect(await screen.findByText('ScheduleList')).toBeInTheDocument();
    expect(mockScreenHeaderProps).toBeDefined();
    expect(mockScreenHeaderProps.streamType).toBe('schedule');
    expect(mockScreenHeaderProps.breadcrumbConfig).toEqual({
      '/schedules': 'Schedules',
    });
  });
});
