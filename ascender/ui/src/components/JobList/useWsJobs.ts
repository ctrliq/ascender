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
  const messages = useWebsocket({
    jobs: ['status_changed'],
    schedules: ['changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Checked against the queue as it stands, so two messages for one new job
  // in the same batch still queue it once.
  const enqueueJobId = (id: number) => {
    setJobsToFetch((ids) => (ids.includes(id) ? ids : ids.concat(id)));
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

  // Every message in the batch is applied, in order. A row's update is built
  // on the rows the message before it left, so two jobs changing status in
  // the same tick both show it; the render's rows only decide whether a job
  // is on the page or has to be read.
  useEffect(() => {
    if (!messages.length) {
      return;
    }
    const params = parseQueryString(qsConfig, location.search);
    messages.forEach((message) => {
      if (!message.unified_job_id) {
        return;
      }
      const jobId = message.unified_job_id;

      if (jobs.some((j) => j.id === jobId)) {
        setJobs((current) => {
          const index = current.findIndex((j) => j.id === jobId);
          return index > -1
            ? sortJobs(updateJob(current, index, message), params)
            : current;
        });
      } else {
        enqueueJobId(jobId);
      }
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

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
