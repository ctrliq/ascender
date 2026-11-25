import type { QSConfig, QSParams } from 'util/qs';
import { updateQueryString } from 'util/qs';
import type { UnifiedJob } from 'types/api';
import type { WebsocketMessage } from 'hooks/useWebsocket';

/** The view-level query parameter that asks the API to group active jobs. */
export const GROUP_BY_PARAM = 'group_by';
/** Group active jobs by their unified job template. */
export const GROUP_BY_TEMPLATE = 'template';
/** Group active jobs by their status. */
export const GROUP_BY_STATUS = 'status';
/** The list filter that opens one template's individual runs. */
export const TEMPLATE_FILTER_PARAM = 'unified_job_template';
/** The list filter that opens one status's individual runs. */
export const STATUS_FILTER_PARAM = 'status';

const STATUS_FILTER_BASES = [STATUS_FILTER_PARAM, `${STATUS_FILTER_PARAM}__in`];
const TEMPLATE_FILTER_BASES = [
  TEMPLATE_FILTER_PARAM,
  `${TEMPLATE_FILTER_PARAM}__in`,
];

/** The prefixes the filter backend allows before a field lookup. */
const FILTER_PREFIXES = /^(?:or__|chain__)?(?:not__)?/;

/**
 * Every namespaced key in the search that targets one of ``bases``, including
 * negated and OR/chain variants.  The base field is matched after stripping
 * those prefixes, so ``status``, ``or__status``, ``not__status``,
 * ``or__not__status`` and ``chain__not__status`` all clear together.
 */
function filterKeysToClear(
  qsConfig: QSConfig,
  search: string,
  bases: string[]
): QSParams {
  const namespacePrefix = qsConfig.namespace ? `${qsConfig.namespace}.` : '';
  const cleared: QSParams = {};
  new URLSearchParams(search).forEach((_value, rawKey) => {
    if (namespacePrefix && !rawKey.startsWith(namespacePrefix)) return;
    const key = namespacePrefix ? rawKey.slice(namespacePrefix.length) : rawKey;
    if (bases.includes(key.replace(FILTER_PREFIXES, ''))) {
      cleared[key] = null;
    }
  });
  return cleared;
}

export type GroupingMode =
  'none' | typeof GROUP_BY_STATUS | typeof GROUP_BY_TEMPLATE;

/** Read the current grouping mode from the search string. */
export function getGroupingMode(search: string): GroupingMode {
  const value = new URLSearchParams(search).get(GROUP_BY_PARAM);
  if (value === GROUP_BY_TEMPLATE) return GROUP_BY_TEMPLATE;
  if (value === GROUP_BY_STATUS) return GROUP_BY_STATUS;
  return 'none';
}

/**
 * Write or remove the un-namespaced group_by value.  group_by is a view-level
 * parameter, so it deliberately bypasses the list's namespace.  The page is
 * always cleared so the new mode starts from page one.  Filters are independent
 * of grouping and are left untouched.
 */
export function setGroupingMode(
  qsConfig: QSConfig,
  search: string,
  mode: GroupingMode
): string {
  const next = updateQueryString(null, search, {
    group_by: mode === 'none' ? null : mode,
  });
  return updateQueryString(qsConfig, next, { page: null });
}

/** The order the stack status chips are rendered in. */
export const STACK_STATUS_ORDER = [
  'new',
  'waiting',
  'pending',
  'running',
] as const;

export type StackStatus = (typeof STACK_STATUS_ORDER)[number];

/**
 * Build the URL for the template-filtered Jobs list from the current search.
 * The stack name link opens this URL so the user sees the individual runs.
 * Grouping is removed explicitly; template filters are replaced rather than
 * combined with stale variants.
 */
export function buildTemplateFilteredUrl(
  qsConfig: QSConfig,
  search: string,
  templateId: number | string
): string {
  let next = updateQueryString(null, search, { [GROUP_BY_PARAM]: null });
  next = updateQueryString(qsConfig, next, {
    ...filterKeysToClear(qsConfig, next, TEMPLATE_FILTER_BASES),
    [TEMPLATE_FILTER_PARAM]: templateId,
    page: 1,
  });
  return `/jobs?${next}`;
}

/**
 * Build the URL for the status-filtered Jobs list from the current search.
 * The status summary row title opens this URL so the user sees the individual
 * runs and grouping is removed.
 */
export function buildStatusFilteredUrl(
  qsConfig: QSConfig,
  search: string,
  status: StackStatus
): string {
  let next = updateQueryString(null, search, { [GROUP_BY_PARAM]: null });
  // The toolbar writes status filters under several keys, including negated
  // forms.  Clear all of them before applying the clicked status, otherwise
  // the target list can keep a contradictory filter and show nothing.
  next = updateQueryString(qsConfig, next, {
    ...filterKeysToClear(qsConfig, next, STATUS_FILTER_BASES),
    [STATUS_FILTER_PARAM]: status,
    page: 1,
  });
  return `/jobs?${next}`;
}

const TERMINAL_JOB_STATUSES = ['successful', 'failed', 'error', 'canceled'];

/** Whether a job status means the job is no longer active. */
export function isTerminalJobStatus(status?: string): boolean {
  return Boolean(status && TERMINAL_JOB_STATUSES.includes(status));
}

/**
 * Whether a terminal message may have ejected a member from a visible stack.
 *
 * The ejected terminal row is not part of the stack-summary response, so the
 * caller waits for its dedicated throttled full-page read.
 */
export function shouldEjectStackRow(
  message: WebsocketMessage,
  jobs: UnifiedJob[]
): boolean {
  if (!isTerminalJobStatus(message.status)) return false;
  const templateId = message.unified_job_template_id;
  if (templateId && jobs.some((job) => job.stack?.template.id === templateId)) {
    return true;
  }
  const jobId = message.unified_job_id;
  const row = jobId ? jobs.find((job) => job.id === jobId) : undefined;
  return Boolean(row?.stack);
}

/**
 * Whether a terminal message may have ejected an active job from a visible
 * status group.  Status rows carry no member ids, so any terminal job message
 * counts while a status row is visible.
 */
export function shouldEjectStatusRow(
  message: WebsocketMessage,
  jobs: UnifiedJob[]
): boolean {
  return Boolean(
    message.unified_job_id &&
    isTerminalJobStatus(message.status) &&
    jobs.some((job) => job.status_group)
  );
}

/**
 * Whether a websocket message can change an active-status count.
 *
 * A job status change always can, because the job left one active status or
 * entered one.  Schedule and control messages do not change the current
 * counts, so they leave the visible rows alone.
 */
export function shouldRefetchStatusSummary(message: WebsocketMessage): boolean {
  return Boolean(message.unified_job_id || message.status);
}

/**
 * Whether a websocket message could change the current stacked page.
 *
 * A message about a displayed job or a visible stack always counts.  A
 * terminal status for a job that is neither displayed nor part of a displayed
 * stack cannot change the page, so it is skipped.  Other messages refetch,
 * because a new active job can form or grow a stack and change the page.
 */
export function shouldRefetchStackedList(
  message: WebsocketMessage,
  jobs: UnifiedJob[]
): boolean {
  const jobId = message.unified_job_id;
  const templateId = message.unified_job_template_id;

  if (jobId && jobs.some((job) => job.id === jobId)) {
    return true;
  }
  if (templateId && jobs.some((job) => job.stack?.template.id === templateId)) {
    return true;
  }
  if (message.status && TERMINAL_JOB_STATUSES.includes(message.status)) {
    return false;
  }
  return true;
}

/** Template ids a websocket message should refresh as a visible stack row. */
export function stackSummaryTemplateIds(
  message: WebsocketMessage,
  jobs: UnifiedJob[]
): number[] {
  const templateId = message.unified_job_template_id;
  if (templateId && jobs.some((job) => job.stack?.template.id === templateId)) {
    return [templateId];
  }

  const jobId = message.unified_job_id;
  const row = jobId ? jobs.find((job) => job.id === jobId) : undefined;
  if (row?.stack) {
    return [row.stack.template.id];
  }

  return [];
}

/**
 * Whether a websocket message needs a full page read rather than a stack
 * summary.  Visible stack rows are handled by the summary read.  A visible
 * non-stack row, a new active stack, or another structural change still needs
 * the page so membership and pagination stay correct.
 */
export function shouldRefetchStackedPage(
  message: WebsocketMessage,
  jobs: UnifiedJob[]
): boolean {
  const jobId = message.unified_job_id;
  const templateId = message.unified_job_template_id;

  const row = jobId ? jobs.find((job) => job.id === jobId) : undefined;
  if (row?.stack) {
    return false;
  }
  if (templateId && jobs.some((job) => job.stack?.template.id === templateId)) {
    return false;
  }
  if (jobId && jobs.some((job) => job.id === jobId)) {
    return true;
  }
  if (message.status && TERMINAL_JOB_STATUSES.includes(message.status)) {
    return false;
  }
  return true;
}
