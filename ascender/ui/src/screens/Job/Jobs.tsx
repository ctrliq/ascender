import type { BreadcrumbResource } from 'types/api';
import React, { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';

import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import JobList from 'components/JobList';
import PersistentFilters from 'components/PersistentFilters';
import Job from './Job';
import JobTypeRedirect from './JobTypeRedirect';
import { JOB_TYPE_URL_SEGMENTS } from '../../constants';

export interface TypeRedirectProps {
  /** Which of the job screens is showing, from the route. */
  view?: string;
  [key: string]: unknown;
}

function TypeRedirect({ view }: TypeRedirectProps) {
  const { id } = useParams() as { id: string };
  return <JobTypeRedirect id={id} view={view} />;
}

// Legacy /runs/system/:id URLs map to the canonical /runs/management/:id;
// preserve any trailing sub-path (the splat) on the redirect.
function SystemRedirect() {
  const { id, '*': rest } = useParams() as { id: string; '*': string };
  return (
    <Navigate to={`/runs/management/${id}${rest ? `/${rest}` : ''}`} replace />
  );
}

function Jobs() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/runs': t`Runs`,
  });

  const buildBreadcrumbConfig = useCallback(
    (job?: BreadcrumbResource) => {
      if (!job) {
        return;
      }

      const typeSegment = JOB_TYPE_URL_SEGMENTS[job.type as string];
      setBreadcrumbConfig({
        '/runs': t`Runs`,
        [`/runs/${typeSegment}/${job.id}`]: `${job.id} - ${job.name}`,
        [`/runs/${typeSegment}/${job.id}/output`]: `${job.id} - ${job.name}`,
        [`/runs/${typeSegment}/${job.id}/details`]: `${job.id} - ${job.name}`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader
        streamType="job,workflow_job,ad_hoc_command"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route
          index
          element={
            <PageSection hasBodyWrapper={false}>
              {/* The card is the page's rather than the list's: every other
                  JobList sits in a tab of a card that is already there. */}
              <Card>
                <PersistentFilters pageKey="jobs">
                  <JobList showTypeColumn />
                </PersistentFilters>
              </Card>
            </PageSection>
          }
        />
        <Route path="system/:id/*" element={<SystemRedirect />} />
        <Route path=":id/details" element={<TypeRedirect view="details" />} />
        <Route path=":id/output" element={<TypeRedirect view="output" />} />
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
