import type { AnyJob } from 'types/api';
import type { WebsocketMessage } from 'hooks/useWebsocket';
import { useState, useEffect } from 'react';
import useWebsocket from 'hooks/useWebsocket';
import { getJobModel } from 'util/jobs';

/**
 * Keeps one job in step with the websocket.
 *
 * Args:
 *   initialJob: the job the screen last fetched, null while it is loading.
 *
 * Returns:
 *   The same job, with its status and finished time updated as messages
 *   arrive, and re-read in full whenever the status settles.
 */
export default function useWsJob(initialJob: AnyJob | null) {
  const [job, setJob] = useState<AnyJob | null>(initialJob);
  const [pendingMessages, setPendingMessages] = useState<WebsocketMessage[]>(
    []
  );
  const messages = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  const processMessage = (message: WebsocketMessage) => {
    if (!job || message.unified_job_id !== job.id) {
      return;
    }

    if (
      ['successful', 'failed', 'error', 'canceled', 'running'].includes(
        message.status ?? ''
      )
    ) {
      fetchJob();
    }
    // On the job as the message before this one left it, not as this render
    // saw it, so a batch of messages ends on the last one's status.
    setJob((current) => (current ? updateJob(current, message) : current));
  };

  async function fetchJob() {
    if (!job?.type || !job?.id) {
      return;
    }
    const { data } = await getJobModel(job.type).readDetail(job.id);
    setJob(data as AnyJob);
  }

  // Every message in the batch is handled, in order. Until the job has loaded
  // they are held back, appended to whatever is already waiting.
  useEffect(
    () => {
      if (!messages.length) {
        return;
      }
      if (job) {
        messages.forEach((message) => {
          processMessage(message);
        });
        return;
      }
      const withJob = messages.filter((message) => message.unified_job_id);
      if (withJob.length) {
        setPendingMessages((pending) => pending.concat(withJob));
      }
    },
    [messages] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!job || !pendingMessages.length) {
      return;
    }
    pendingMessages.forEach((message) => {
      processMessage(message);
    });
    setPendingMessages([]);
  }, [job, pendingMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  return job;
}

function updateJob(job: AnyJob, message: WebsocketMessage): AnyJob {
  return {
    ...job,
    finished: message.finished,
    status: message.status as AnyJob['status'],
  };
}
