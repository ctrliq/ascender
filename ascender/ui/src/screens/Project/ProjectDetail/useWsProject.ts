import type { Project } from 'types/api';
import { useState, useEffect } from 'react';
import useWebsocket from 'hooks/useWebsocket';
import { ProjectsAPI } from 'api';

export default function useWsProjects(initialProject: Project) {
  const [project, setProject] = useState(initialProject);
  const messages = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  const refreshProject = async () => {
    const { data } = await ProjectsAPI.readDetail(project.id);
    setProject(data);
  };

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  // Every message in the batch is applied, each on the project the one before
  // it left, so a sync that moves on twice in one tick shows where it got to.
  // The jobs group carries every job the user can see, so only this project's
  // own updates count: taking another project's sync as current_job would
  // offer Cancel on a run that has nothing to do with the one on screen.
  useEffect(
    () => {
      messages.forEach((message) => {
        const jobId = message.unified_job_id;
        if (
          !project ||
          !jobId ||
          message.type !== 'project_update' ||
          message.project_id !== project.id
        ) {
          return;
        }

        // A sync that ends in error sends no finished time, so the end is
        // read from the status: any status past running reads the project
        // back, which is what clears current_job and shows the new revision.
        if (
          message.finished ||
          ['successful', 'failed', 'error', 'canceled'].includes(
            message.status as string
          )
        ) {
          refreshProject();
          return;
        }

        setProject((current) => ({
          ...current,
          summary_fields: {
            ...current.summary_fields,
            current_job: {
              id: jobId,
              status: message.status,
              finished: message.finished,
            },
          },
        }));
      });
    },
    [messages] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return project;
}
