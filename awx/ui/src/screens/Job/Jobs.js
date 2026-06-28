import React, { useState, useCallback } from 'react';
import {
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { PageSection } from '@patternfly/react-core';

import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import JobList from 'components/JobList';
import PersistentFilters from 'components/PersistentFilters';
import Job from './Job';
import JobTypeRedirect from './JobTypeRedirect';
import { JOB_TYPE_URL_SEGMENTS } from '../../constants';

function TypeRedirect({ view }) {
  const { id } = useParams();
  return <JobTypeRedirect id={id} view={view} />;
}

// Legacy /jobs/system/:id URLs map to the canonical /jobs/management/:id;
// preserve any trailing sub-path (the splat) on the redirect.
function SystemRedirect() {
  const { id, '*': rest } = useParams();
  return (
    <Navigate
      to={`/jobs/management/${id}${rest ? `/${rest}` : ''}`}
      replace
    />
  );
}

function Jobs() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/jobs': t`Jobs`,
  });

  const buildBreadcrumbConfig = useCallback(
    (job) => {
      if (!job) {
        return;
      }

      const typeSegment = JOB_TYPE_URL_SEGMENTS[job.type];
      setBreadcrumbConfig({
        '/jobs': t`Jobs`,
        [`/jobs/${typeSegment}/${job.id}`]: `${job.id} - ${job.name}`,
        [`/jobs/${typeSegment}/${job.id}/output`]: t`Output`,
        [`/jobs/${typeSegment}/${job.id}/details`]: t`Details`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader streamType="job" breadcrumbConfig={breadcrumbConfig} />
      <Routes>
        <Route
          index
          element={
            <PageSection hasBodyWrapper={false}>
              <PersistentFilters pageKey="jobs">
                <JobList showTypeColumn />
              </PersistentFilters>
            </PageSection>
          }
        />
        <Route path="system/:id/*" element={<SystemRedirect />} />
        <Route
          path=":id/details"
          element={<TypeRedirect view="details" />}
        />
        <Route
          path=":id/output"
          element={<TypeRedirect view="output" />}
        />
        {/* /* so the nested <Job> route tree can match details/output */}
        <Route
          path=":typeSegment/:id/*"
          element={<Job setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route path=":id" element={<TypeRedirect />} />
      </Routes>
    </>
  );
}

export { Jobs as _Jobs };
export default Jobs;
