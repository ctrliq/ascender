import type { UnifiedJob } from 'types/api';
import type { QSParams } from 'util/qs';

const sortFns = {
  finished: byFinished,
  id: byId,
  name: byName,
  created_by__id: byCreatedBy,
  unified_job_template__project__id: byProject,
  started: byStarted,
};

/**
 * Orders a page of jobs the way the list's query string asks for.
 *
 * Args:
 *   jobs: the jobs currently on the page, which the websocket has updated.
 *   params: the list's query string, already parsed.
 *
 * Returns:
 *   The jobs in order, cut back to one page.
 */
export default function sortJobs(jobs: UnifiedJob[], params: QSParams) {
  const { order_by = '-finished', page_size = 20 } = params as {
    order_by?: string;
    page_size?: number;
  };
  const key = order_by.replace('-', '');
  const fn = sortFns[key as keyof typeof sortFns];
  if (!fn) {
    return jobs.slice(0, page_size);
  }

  const sorted = order_by[0] === '-' ? jobs.sort(reverse(fn)) : jobs.sort(fn);
  return sorted.slice(0, page_size);
}

/** One comparison between two jobs, in the shape Array.sort takes. */
type JobComparator = (a: UnifiedJob, b: UnifiedJob) => number;

function reverse(fn: JobComparator): JobComparator {
  return (a, b) => fn(a, b) * -1;
}

function byFinished(a: UnifiedJob, b: UnifiedJob) {
  if (!a.finished) {
    return 1;
  }
  if (!b.finished) {
    return -1;
  }
  return sort(new Date(a.finished as string), new Date(b.finished as string));
}

function byStarted(a: UnifiedJob, b: UnifiedJob) {
  if (!a.started) {
    return 1;
  }
  if (!b.started) {
    return -1;
  }
  return sort(new Date(a.started as string), new Date(b.started as string));
}

function byId(a: UnifiedJob, b: UnifiedJob) {
  return sort(a.id, b.id);
}

function byName(a: UnifiedJob, b: UnifiedJob) {
  return sort(a.name, b.name);
}

function byCreatedBy(a: UnifiedJob, b: UnifiedJob) {
  const nameA = a.summary_fields?.created_by?.id;
  const nameB = b.summary_fields?.created_by?.id;
  return sort(nameA, nameB) * -1;
}

function byProject(a: UnifiedJob, b: UnifiedJob) {
  return sort(a.unified_job_template, b.unified_job_template);
}

/**
 * Orders two of whatever a comparison above pulled off the jobs, which is a
 * date, a number or a name, with anything missing sorted to the end.
 */
function sort(
  a?: Date | number | string | null,
  b?: Date | number | string | null
) {
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
