import type { ScreenHeaderProps } from 'components/ScreenHeader/ScreenHeader';
import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AllSchedules from './AllSchedules';

vi.mock('../../api');

// resetMocks strips vi.fn implementations between tests, so capture the
// props with a plain function instead of asserting on mock.calls.
let mockScreenHeaderProps: ScreenHeaderProps | undefined;
vi.mock('components/ScreenHeader', () => ({
  __esModule: true,
  default: (props: ScreenHeaderProps) => {
    mockScreenHeaderProps = props;
    return null;
  },
}));

// Marker for the routed list so the assertion is about which branch of the
// v6 <Routes> tree resolves.
vi.mock('components/Schedule', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    ScheduleList: () => ReactLib.createElement('div', null, 'ScheduleList'),
  };
});

function renderAt(path: string) {
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
    expect(mockScreenHeaderProps?.streamType).toBe('schedule');
    expect(mockScreenHeaderProps?.breadcrumbConfig).toEqual({
      '/schedules': 'Schedules',
    });
  });
});
