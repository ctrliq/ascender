import React, { useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router';
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
      <Routes>
        <Route
          index
          element={
            <PageSection hasBodyWrapper={false}>
              <Card>
                <ScheduleList
                  loadSchedules={loadSchedules}
                  loadScheduleOptions={loadScheduleOptions}
                  hideAddButton
                />
              </Card>
            </PageSection>
          }
        />
        <Route path="*" element={<Navigate to="/schedules" replace />} />
      </Routes>
    </>
  );
}

export default AllSchedules;
