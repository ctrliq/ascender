import type { UnifiedJob } from 'types/api';
import type { WebsocketMessage } from 'hooks/useWebsocket';
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
  initialJobs: UnifiedJob[],
  fetchJobsById: (ids: (number | string)[]) => Promise<UnifiedJob[]>,
  qsConfig: QSConfig
) {
  const location = useLocation();
  const [jobs, setJobs] = useState<UnifiedJob[]>(initialJobs);
  const [jobsToFetch, setJobsToFetch] = useState<number[]>([]);
  const throttledJobsToFetch = useThrottle(jobsToFetch, 5000);
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    schedules: ['changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  const enqueueJobId = (id: number) => {
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
        (job) => !jobs.find((j) => j.id === job.id)
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
    const jobId = lastMessage.unified_job_id as number;
    const index = jobs.findIndex((j) => j.id === jobId);

    if (index > -1) {
      setJobs(sortJobs(updateJob(jobs, index, lastMessage), params));
    } else {
      enqueueJobId(jobId);
    }
  }, [lastMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  return jobs;
}

/** The row the socket's message describes, with what it reports put on it. */
function updateJob(
  jobs: UnifiedJob[],
  index: number,
  message: WebsocketMessage
): UnifiedJob[] {
  const job: UnifiedJob = {
    ...(jobs[index] as UnifiedJob),
    status: message.status as UnifiedJob['status'],
    finished: message.finished ?? null,
  };
  return [...jobs.slice(0, index), job, ...jobs.slice(index + 1)];
}
