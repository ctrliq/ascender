import type { Untyped } from 'types/api';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import useWebsocket from 'hooks/useWebsocket';
import useThrottle from 'hooks/useThrottle';
import { parseQueryString } from 'util/qs';
import type { QSConfig } from 'util/qs';
import sortJobs from './sortJobs';

/**
 * Keeps a job list in step with the websocket.
 *
 * Args:
 *   initialJobs: the page of jobs the list last fetched.
 *   fetchJobsById: re-reads the jobs whose status changed, in one request.
 *   qsConfig: the list's query string configuration, which says whether a
 *     newly arrived job belongs on the page being shown.
 *
 * Returns:
 *   The same jobs, with their statuses updated as messages arrive.
 */
export default function useWsJobs(
  initialJobs: Untyped[],
  fetchJobsById: (ids: (number | string)[]) => Promise<Untyped[]>,
  qsConfig: QSConfig
) {
  const location = useLocation();
  const [jobs, setJobs] = useState<Untyped[]>(initialJobs);
  const [jobsToFetch, setJobsToFetch] = useState<Untyped[]>([]);
  const throttledJobsToFetch = useThrottle(jobsToFetch, 5000);
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    schedules: ['changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  const enqueueJobId = (id: number | string) => {
    if (!jobsToFetch.includes(id)) {
      setJobsToFetch((ids) => ids.concat(id));
    }
  };
  useEffect(() => {
    (async () => {
      if (!throttledJobsToFetch.length) {
        return;
      }
      setJobsToFetch([]);
      const newJobs = await fetchJobsById(throttledJobsToFetch);
      const deduplicated = newJobs.filter(
        (job: Untyped) => !jobs.find((j: Untyped) => j.id === job.id)
      );
      if (deduplicated.length) {
        const params = parseQueryString(qsConfig, location.search);
        setJobs(sortJobs([...deduplicated, ...jobs], params));
      }
    })();
  }, [throttledJobsToFetch, fetchJobsById]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lastMessage || !lastMessage.unified_job_id) {
      return;
    }
    const params = parseQueryString(qsConfig, location.search);
    const jobId = lastMessage.unified_job_id;
    const index = jobs.findIndex((j: Untyped) => j.id === jobId);

    if (index > -1) {
      setJobs(sortJobs(updateJob(jobs, index, lastMessage), params));
    } else {
      enqueueJobId(lastMessage.unified_job_id);
    }
  }, [lastMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  return jobs;
}

function updateJob(jobs: Untyped, index: number, message: Untyped) {
  const job = {
    ...jobs[index],
    status: message.status,
    finished: message.finished,
  };
  return [...jobs.slice(0, index), job, ...jobs.slice(index + 1)];
}
