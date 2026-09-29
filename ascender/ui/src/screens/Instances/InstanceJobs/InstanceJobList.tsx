import type { SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useParams } from 'react-router';

import { InstancesAPI } from 'api';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import JobList from 'components/JobList';
import useRequest from 'hooks/useRequest';

export interface InstanceJobListProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

/**
 * The runs an instance executed.
 *
 * The api's own list for this, /instances/{id}/jobs/, is the unified jobs
 * whose execution node is the instance's hostname. The shared run list reads
 * /unified_jobs/, so it is given that same filter rather than a second
 * endpoint, and keeps its search, sorting and live updates.
 */
function InstanceJobList({ setBreadcrumb }: InstanceJobListProps) {
  const { id } = useParams() as { id: string };

  const {
    result: instance,
    error,
    isLoading,
    request: fetchInstance,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InstancesAPI.readDetail(id);
      return data;
    }, [id]),
    null
  );

  useEffect(() => {
    fetchInstance();
  }, [fetchInstance]);

  useEffect(() => {
    if (instance) {
      setBreadcrumb(instance);
    }
  }, [instance, setBreadcrumb]);

  if (error) {
    return <ContentError error={error} />;
  }
  if (isLoading || !instance) {
    return <ContentLoading />;
  }

  return (
    <JobList
      showTypeColumn
      defaultParams={{ execution_node: instance.hostname }}
      // Nothing is launched from an instance, so the generic Run menu has no
      // place here.
      runControl={false}
    />
  );
}

export default InstanceJobList;
