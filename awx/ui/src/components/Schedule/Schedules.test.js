import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import Schedules from './Schedules';

describe('<Schedules />', () => {
  test('initially renders successfully', async () => {
    let wrapper;
    const history = createMemoryHistory({
      initialEntries: ['/templates/job_template/1/schedules'],
    });
    const jobTemplate = { id: 1, name: 'Mock JT' };

    // Schedules uses relative routes, so mount it under its ".../schedules/*"
    // parent route.
    await act(async () => {
      wrapper = mountWithContexts(
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
    });
    expect(wrapper.length).toBe(1);
  });
});
