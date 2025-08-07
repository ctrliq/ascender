import React, { useCallback } from 'react';
import { Route, Switch } from 'react-router-dom';
import { PageSection, Card } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import ScreenHeader from 'components/ScreenHeader';
import { ScheduleList } from 'components/Schedule';
import { SchedulesAPI } from 'api';

function AllSchedules() {
  const { t } = useLingui();

  const loadScheduleOptions = useCallback(() => SchedulesAPI.readOptions(), []);

  const loadSchedules = useCallback((params) => SchedulesAPI.read(params), []);

  return (
    <>
      <ScreenHeader
        streamType="schedule"
        breadcrumbConfig={{
          '/schedules': t`Schedules`,
        }}
      />
      <Switch>
        <Route path="/schedules">
          <PageSection>
            <Card>
              <ScheduleList
                loadSchedules={loadSchedules}
                loadScheduleOptions={loadScheduleOptions}
                hideAddButton
              />
            </Card>
          </PageSection>
        </Route>
      </Switch>
    </>
  );
}

export default AllSchedules;
