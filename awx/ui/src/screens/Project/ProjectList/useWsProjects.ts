import type { Project } from 'types/api';
import { useState, useEffect } from 'react';
import useWebsocket from 'hooks/useWebsocket';

export default function useWsProjects(initialProjects: Project[]) {
  const [projects, setProjects] = useState(initialProjects);
  const lastMessage = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    if (!lastMessage?.unified_job_id || lastMessage.type !== 'project_update') {
      return;
    }
    const index = projects.findIndex((p) => p.id === lastMessage.project_id);
    if (index === -1) {
      return;
    }

    const project = projects[index] as Project;
    const updatedProject: Project = {
      ...project,
      summary_fields: {
        ...project.summary_fields,
        current_job: {
          id: lastMessage.unified_job_id as number,
          status: lastMessage.status,
          finished: lastMessage.finished,
        },
      },
      // A finished sync leaves the revision the list holds stale, and blanking
      // it is what makes the row show the new one on the next read. Every
      // reader tests it for truth, so the empty string reads the same as null.
      ...(lastMessage.finished ? { scm_revision: '' } : {}),
    };

    setProjects([
      ...projects.slice(0, index),
      updatedProject,
      ...projects.slice(index + 1),
    ]);
  }, [lastMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  return projects;
}
