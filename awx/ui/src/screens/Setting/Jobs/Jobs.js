import React from 'react';
import { Link } from 'react-router';
import { Routes, Route, Navigate } from 'routerCompat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import JobsDetail from './JobsDetail';
import JobsEdit from './JobsEdit';

function Jobs() {
  const { t } = useLingui();
  const baseURL = '/settings/jobs';
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path="details" element={<JobsDetail />} />
          <Route path="edit" element={<JobsEdit />} />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>{t`View Jobs settings`}</Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Jobs;
