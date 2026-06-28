import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Schedules from './Schedules';

describe('<Schedules />', () => {
  test('initially renders successfully', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/templates/job_template/1/schedules'],
    });
    const jobTemplate = { id: 1, name: 'Mock JT' };

    // Schedules uses relative routes, so mount it under its ".../schedules/*"
    // parent route.
    const { container } = renderWithContexts(
      <Routes>
        <Route
          path="/templates/job_template/:id/schedules/*"
          element={
            <Schedules
              setBreadcrumb={() => {}}
              jobTemplate={jobTemplate}
              loadSchedules={() => {}}
              loadScheduleOptions={() => {}}
              apiModel={{ createSchedule: () => {} }}
            />
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );

    // the index route resolves to ScheduleList, whose toolbar (with the
    // "Select all" control) renders once the component mounts
    expect(
      await screen.findByRole('checkbox', { name: 'Select all' })
    ).toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });
});
