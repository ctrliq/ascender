import type { AnyUnifiedJobTemplate } from 'types/api';
import { useState, useEffect } from 'react';
import type { WebsocketMessage } from './useWebsocket';
import useWebsocket from './useWebsocket';

export default function useWsTemplates(
  initialTemplates: AnyUnifiedJobTemplate[]
) {
  const [templates, setTemplates] =
    useState<AnyUnifiedJobTemplate[]>(initialTemplates);
  const messages = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  // Every message in the batch is applied, each on the templates the one
  // before it left, so two jobs of one template finishing together both show
  // in its sparkline.
  useEffect(() => {
    messages.forEach((message) => {
      if (!message.unified_job_id) {
        return;
      }
      setTemplates((current) =>
        current.map((template) =>
          template.id === message.unified_job_template_id
            ? updateTemplate(template, message)
            : template
        )
      );
    });
  }, [messages]);

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
