import React, { useCallback } from 'react';
import { Route, Switch } from 'react-router-dom';
import { t } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import ScreenHeader from 'components/ScreenHeader';
import { ScheduleList } from 'components/Schedule';
import { SchedulesAPI } from 'api';

function AllSchedules() {
  const { i18n } = useLingui();

  const loadScheduleOptions = useCallback(() => SchedulesAPI.readOptions(), []);

  const loadSchedules = useCallback((params) => SchedulesAPI.read(params), []);

  return (
    <>
      <ScreenHeader
        streamType="schedule"
        breadcrumbConfig={{
          '/schedules': i18n._(t`Schedules`),
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
