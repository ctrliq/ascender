import React, { useCallback, useEffect } from 'react';
import { Link } from 'react-router';
import { Navigate } from 'routerCompat';
import { PageSection, Card } from '@patternfly/react-core';

import { useLingui } from '@lingui/react/macro';

import useRequest from 'hooks/useRequest';
import { UnifiedJobsAPI } from 'api';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { JOB_TYPE_URL_SEGMENTS } from '../../constants';

const NOT_FOUND = 'not found';

function JobTypeRedirect({ id, view = 'output' }) {
  const { t } = useLingui();
  const {
    isLoading,
    error,
    result: { job },
    request: loadJob,
  } = useRequest(
    useCallback(async () => {
      const {
        data: { results },
      } = await UnifiedJobsAPI.read({ id });
      const [item] = results;
      return { job: item };
    }, [id]),
    { job: {} }
  );
  useEffect(() => {
    loadJob();
  }, [loadJob]);

  if (error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          {error === NOT_FOUND ? (
            <ContentError isNotFound>
              <Link to="/jobs">{t`View all Jobs`}</Link>
            </ContentError>
          ) : (
            <ContentError error={error} />
          )}
        </Card>
      </PageSection>
    );
  }
  if (isLoading || !job?.id) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }
  const typeSegment = JOB_TYPE_URL_SEGMENTS[job.type];
  return (
    <Navigate to={`/jobs/${typeSegment}/${job.id}/${view}`} replace />
  );
}

export default JobTypeRedirect;
