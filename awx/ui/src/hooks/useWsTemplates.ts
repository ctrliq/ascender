import type { AnyUnifiedJobTemplate } from 'types/api';
import { useState, useEffect } from 'react';
import type { WebsocketMessage } from './useWebsocket';
import useWebsocket from './useWebsocket';

export default function useWsTemplates(
  initialTemplates: AnyUnifiedJobTemplate[]
) {
  const [templates, setTemplates] =
    useState<AnyUnifiedJobTemplate[]>(initialTemplates);
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  useEffect(
    () => {
      if (!lastMessage?.unified_job_id) {
        return;
      }
      const index = templates.findIndex(
        (t) => t.id === lastMessage.unified_job_template_id
      );
      if (index === -1) {
        return;
      }

      const template = templates[index];
      if (!template) {
        return;
      }
      const updated = [...templates];
      updated[index] = updateTemplate(template, lastMessage);
      setTemplates(updated);
    },
    [lastMessage] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return templates;
}

/**
 * Folds a job status message into the template that job ran from, so the
 * list's recent jobs sparkline redraws without a re-read.
 *
 * Generic in the template so the caller gets back what it handed over: the
 * only member this touches is summary_fields.recent_jobs.
 */
function updateTemplate<T extends AnyUnifiedJobTemplate>(
  template: T,
  message: WebsocketMessage
): T {
  const summaryFields = (template.summary_fields ?? {}) as {
    recent_jobs?: Record<string, unknown>[];
  };
  const recentJobs = [...(summaryFields.recent_jobs || [])];
  const job = {
    id: message.unified_job_id,
    status: message.status,
    finished: message.finished || null,
    type: message.type,
  };
  const index = recentJobs.findIndex((j) => j.id === job.id);
  if (index > -1) {
    recentJobs[index] = {
      ...recentJobs[index],
      ...job,
    };
  } else {
    recentJobs.unshift(job);
  }

  return {
    ...template,
    summary_fields: {
      ...summaryFields,
      recent_jobs: recentJobs.slice(0, 10),
    },
  };
}
