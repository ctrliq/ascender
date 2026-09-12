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
  const lastMessage = useWebsocket({
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
    setJob(updateJob(job, message));
  };

  async function fetchJob() {
    if (!job?.type || !job?.id) {
      return;
    }
    const { data } = await getJobModel(job.type).readDetail(job.id);
    setJob(data as AnyJob);
  }

  useEffect(
    () => {
      if (!lastMessage) {
        return;
      }
      if (job) {
        processMessage(lastMessage);
      } else if (lastMessage.unified_job_id) {
        setPendingMessages(pendingMessages.concat(lastMessage));
      }
    },
    [lastMessage] // eslint-disable-line react-hooks/exhaustive-deps
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
