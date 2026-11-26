import type { Project } from 'types/api';
import { useState, useEffect, useRef } from 'react';
import useWebsocket from 'hooks/useWebsocket';

/**
 * Reads one project again once its sync has ended, and hands back what it
 * read. Nothing, or nothing to merge, leaves the row as the socket left it.
 */
type ReadFinishedProject = (
  projectId: number
) => Promise<Project | null | undefined> | void;

/**
 * Keeps the project rows in step with the syncs the websocket reports.
 *
 * A sync that ends leaves the row holding the revision it had before, so the
 * list is asked to read that one project again: the new revision then arrives
 * on its own, with nothing for the reader to click.
 *
 * Each finished project is read on its own and its answer merged into the
 * rows by id. Two syncs ending close together start two reads, and both have
 * to land: a single shared request keeps only its latest answer, which left
 * the first project holding its finished job and showing Syncing for good.
 */
export default function useWsProjects(
  initialProjects: Project[],
  onSyncFinished?: ReadFinishedProject
) {
  const [projects, setProjects] = useState(initialProjects);
  const messages = useWebsocket({
    jobs: ['status_changed'],
    control: ['limit_reached_1'],
  });

  /* How many reads each project has had started, so that of two reads of the
     same project only the later one is merged, whichever order they land in. */
  const readCounts = useRef<Record<number, number>>({});
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  /* Every message in the batch is applied, in order: two syncs ending in the
     same tick arrive in one batch, and both rows have to move on. */
  useEffect(() => {
    messages.forEach((message) => {
      if (!message.unified_job_id || message.type !== 'project_update') {
        return;
      }
      const projectId = message.project_id as number;
      if (!projects.some((p) => p.id === projectId)) {
        return;
      }

      /* Built on the rows as they stand when React applies it, not as this
         render saw them, so an update queued just before is never undone. */
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                summary_fields: {
                  ...project.summary_fields,
                  current_job: {
                    id: message.unified_job_id as number,
                    status: message.status,
                    finished: message.finished,
                  },
                },
              }
            : project
        )
      );

      // The revision, and everything else the sync wrote, comes from the read.
      if (message.finished && onSyncFinished) {
        readFinishedProject(projectId, onSyncFinished);
      }
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Reads one finished project again and puts what comes back in its row.
   *
   * @param projectId - The project whose sync the socket reported as ended.
   * @param read - The list's reader for that one project.
   */
  async function readFinishedProject(
    projectId: number,
    read: ReadFinishedProject
  ) {
    const count = (readCounts.current[projectId] ?? 0) + 1;
    readCounts.current[projectId] = count;

    let updated: Project | null | undefined;
    try {
      updated = (await read(projectId)) ?? null;
    } catch {
      // The reader reports its own failures; the row keeps what it had.
      return;
    }
    if (
      !updated ||
      !isMounted.current ||
      readCounts.current[projectId] !== count
    ) {
      return;
    }
    setProjects((current) =>
      current.map((project) => (project.id === updated.id ? updated : project))
    );
  }

  return projects;
}
