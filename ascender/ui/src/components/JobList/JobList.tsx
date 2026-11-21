import type {
  ApiResponse,
  JobStatus,
  OptionsResponse,
  UnifiedJob,
} from 'types/api';
import React, {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLingui, Plural } from '@lingui/react/macro';

import { Card } from '@patternfly/react-core';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import useSelected from 'hooks/useSelected';
import useExpanded from 'hooks/useExpanded';
import { isJobRunning, getJobModel } from 'util/jobs';
import type { QSParams } from 'util/qs';
import type { WebsocketMessage } from 'hooks/useWebsocket';
import { parseQueryString, updateQueryString } from 'util/qs';
import { UnifiedJobsAPI, InventorySourcesAPI } from 'api';
import { getJobListQSConfig } from './qsConfig';
import AlertModal from '../AlertModal';
import DatalistToolbar from '../DataListToolbar';
import ErrorDetail from '../ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarDeleteButton,
  getSearchableKeys,
} from '../PaginatedTable';
import JobListItem from './JobListItem';
import JobListCancelButton from './JobListCancelButton';
import GroupBySelect from './GroupBySelect';
import {
  GROUP_BY_PARAM,
  GROUP_BY_STATUS,
  GROUP_BY_TEMPLATE,
  getGroupingMode,
  shouldEjectStackRow,
  shouldEjectStatusRow,
  shouldRefetchStackedPage,
} from './stacks';
import useWsJobs from './useWsJobs';
import useThrottledRefetch from './useThrottledRefetch';
import useStackSummaryRefetch from './useStackSummaryRefetch';
import useStatusSummaryRefetch, {
  type StatusCounts,
} from './useStatusSummaryRefetch';

/**
 * The summary fields the Jobs list rows and their expanded details read.
 *
 * Only list requests ask for these; detail views keep requesting everything.
 * Keep this in step with `JobListItem`, `LaunchedByDetail`, `sortJobs` and the
 * detail components it renders.
 */
const GROUPED_PAGE_THROTTLE_MS = 5000;
const GROUPED_PAGE_SAFETY_MS = 60000;
const GROUPED_PAGE_SAFETY_JITTER_MS = 15000;
const GROUPED_EJECTION_THROTTLE_MS = 4000;

export const JOB_LIST_SUMMARY_FIELDS = [
  'credentials',
  'execution_environment',
  'inventory',
  'job_template',
  'labels',
  'project',
  'schedule',
  'source_workflow_job',
  'unified_job_template',
  'workflow_job_template',
  'user_capabilities',
  'created_by',
];

export interface JobListProps {
  /** Narrows the list to one resource's jobs, merged into the query string. */
  defaultParams?: QSParams;
  showTypeColumn?: boolean;
  showGroupingSelector?: boolean;
  additionalRelatedSearchableKeys?: string[];
  [key: string]: unknown;
}

function JobList({
  defaultParams,
  showTypeColumn = false,
  showGroupingSelector = false,
  additionalRelatedSearchableKeys = [],
}: JobListProps) {
  const { t } = useLingui();
  const qsConfig = useMemo(
    () => getJobListQSConfig(defaultParams),
    [defaultParams]
  );

  const { me } = useConfig();
  const location = useLocation();
  const navigate = useNavigate();

  const [actionsResponse, setActionsResponse] =
    useState<ApiResponse<OptionsResponse> | null>(null);
  const [inventorySourceResponse, setInventorySourceResponse] =
    useState<ApiResponse<OptionsResponse> | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      UnifiedJobsAPI.readOptions(),
      InventorySourcesAPI.readOptions(),
    ])
      .then(([actions, inventorySource]) => {
        if (!active) return;
        setActionsResponse(actions);
        setInventorySourceResponse(inventorySource);
      })
      .catch(() => {
        // The list still renders without option metadata.
      });
    return () => {
      active = false;
    };
  }, []);

  const pageGeneration = useRef(0);

  const buildJobsParams = useCallback(() => {
    const params = parseQueryString(qsConfig, location.search);
    params.summary_fields = JOB_LIST_SUMMARY_FIELDS.join(',');
    const groupingMode = getGroupingMode(location.search);
    if (groupingMode === GROUP_BY_STATUS) {
      params[GROUP_BY_PARAM] = GROUP_BY_STATUS;
    } else if (groupingMode === GROUP_BY_TEMPLATE) {
      params[GROUP_BY_PARAM] = GROUP_BY_TEMPLATE;
    }
    return params;
  }, [qsConfig, location.search]);

  const {
    result: { results, count },
    error: contentError,
    isLoading,
    request: fetchJobs,
    requestSilently: fetchJobsSilently,
    setValue,
  } = useRequest(
    useCallback(async () => {
      pageGeneration.current += 1;
      const response = await UnifiedJobsAPI.read({ ...buildJobsParams() });

      return {
        results: response.data.results,
        count: response.data.count,
      };
    }, [buildJobsParams]),
    {
      results: [],
      count: 0,
    },
    { latestOnly: true }
  );

  const inventorySourceChoices =
    inventorySourceResponse?.data.actions.GET?.source?.choices ?? [];
  const relatedSearchableKeys = (
    actionsResponse?.data.related_search_fields || []
  ).map((val) => val.slice(0, -8));
  const searchableKeys = actionsResponse
    ? getSearchableKeys(actionsResponse.data.actions.GET)
    : [];
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchJobsById = useCallback(
    async (ids: (number | string)[]) => {
      const params = parseQueryString(qsConfig, location.search);
      params.id__in = ids.join(',');
      params.summary_fields = JOB_LIST_SUMMARY_FIELDS.join(',');
      try {
        const { data } = await UnifiedJobsAPI.read(params);
        if (!isMounted.current) return [];
        return data.results;
      } catch (e) {
        return [];
      }
    },
    [qsConfig, location.search]
  );

  const fetchStackSummaries = useCallback(
    async (templateIds: number[]) => {
      const params = parseQueryString(qsConfig, location.search);
      params.summary_fields = JOB_LIST_SUMMARY_FIELDS.join(',');
      params.unified_job_template__in = templateIds.join(',');
      delete params.page;
      delete params.page_size;
      delete params.order_by;
      delete params.id__in;
      delete params[GROUP_BY_PARAM];
      const { data } = await UnifiedJobsAPI.readStackSummaries(params);
      return data.results;
    },
    [qsConfig, location.search]
  );

  const mergeStackSummaries = useCallback(
    (rows: UnifiedJob[]) => {
      const byTemplate = new Map<number, UnifiedJob>();
      rows.forEach((row) => {
        const templateId = row.stack?.template.id;
        if (templateId) byTemplate.set(templateId, row);
      });
      if (!byTemplate.size) return;

      setValue((previous) => {
        let changed = false;
        const nextResults = previous.results.map((job) => {
          const templateId = job.stack?.template.id;
          if (templateId && byTemplate.has(templateId)) {
            changed = true;
            return byTemplate.get(templateId) as UnifiedJob;
          }
          return job;
        });
        return changed ? { ...previous, results: nextResults } : previous;
      });
    },
    [setValue]
  );

  const listParams = useMemo(
    () => parseQueryString(qsConfig, location.search),
    [qsConfig, location.search]
  );
  const groupingMode = useMemo(
    () => getGroupingMode(location.search),
    [location.search]
  );
  const isTemplateGrouped = groupingMode === GROUP_BY_TEMPLATE;
  const isStatusGrouped = groupingMode === GROUP_BY_STATUS;
  const isGrouped = isTemplateGrouped || isStatusGrouped;

  const shouldEject = useCallback(
    (message: WebsocketMessage) => {
      if (isTemplateGrouped) return shouldEjectStackRow(message, results);
      if (isStatusGrouped) return shouldEjectStatusRow(message, results);
      return false;
    },
    [isTemplateGrouped, isStatusGrouped, results]
  );

  const wsJobs = useWsJobs(results, fetchJobsById, qsConfig, !isGrouped);

  const {
    refetch: refetchPage,
    noteEjection,
    lastMessage,
  } = useThrottledRefetch({
    refetch: fetchJobsSilently,
    // Status counts refresh through the summary endpoint.  A full page read is
    // requested only when that summary reports a membership change.
    shouldRefetch: (message) =>
      isStatusGrouped ? false : shouldRefetchStackedPage(message, results),
    // A terminal row ejected from a surviving group is not part of the summary
    // response.  Its own slower throttle keeps finish storms from turning into
    // full-page storms, while any full page satisfies the pending ejection.
    shouldEject,
    throttleMs: GROUPED_PAGE_THROTTLE_MS,
    ejectionThrottleMs: GROUPED_EJECTION_THROTTLE_MS,
    safetyIntervalMs: GROUPED_PAGE_SAFETY_MS,
    safetyJitterMs: GROUPED_PAGE_SAFETY_JITTER_MS,
    enabled: isGrouped,
  });

  const fetchStatusSummaries = useCallback(async (): Promise<StatusCounts> => {
    const params = parseQueryString(qsConfig, location.search);
    delete params.page;
    delete params.page_size;
    delete params.order_by;
    delete params.id__in;
    delete params[GROUP_BY_PARAM];
    const { data } = await UnifiedJobsAPI.readStatusSummaries(params);
    return data.counts;
  }, [qsConfig, location.search]);

  const mergeStatusSummaries = useCallback(
    (counts: StatusCounts) => {
      const visibleStatuses = new Set<JobStatus>(
        results
          .map((job) => job.status_group?.status)
          .filter((status): status is JobStatus => Boolean(status))
      );
      if (!visibleStatuses.size) return;

      const returnedStatuses = Object.keys(counts) as JobStatus[];
      const previousTotal = results.reduce(
        (sum, job) => sum + (job.status_group?.count ?? 0),
        0
      );
      const nextTotal = returnedStatuses.reduce(
        (sum, status) => sum + (counts[status] ?? 0),
        0
      );
      const membershipChanged =
        returnedStatuses.some(
          (status) => (counts[status] ?? 0) > 0 && !visibleStatuses.has(status)
        ) ||
        [...visibleStatuses].some((status) => counts[status] === undefined);

      if (membershipChanged) {
        refetchPage();
        return;
      }

      if (nextTotal < previousTotal) {
        noteEjection();
      }

      setValue((previous) => {
        let changed = false;
        const nextResults = previous.results.map((job) => {
          const status = job.status_group?.status;
          if (!status) return job;
          const count = counts[status];
          if (count === undefined || job.status_group?.count === count) {
            return job;
          }
          changed = true;
          return {
            ...job,
            status_group: { ...job.status_group, count },
          } as UnifiedJob;
        });
        return changed ? { ...previous, results: nextResults } : previous;
      });
    },
    [results, refetchPage, noteEjection, setValue]
  );

  useStackSummaryRefetch({
    lastMessage,
    jobs: results,
    refetch: fetchStackSummaries,
    onRows: mergeStackSummaries,
    onMemberLost: noteEjection,
    onStructuralChange: refetchPage,
    pageKey: location.search,
    getPageGeneration: () => pageGeneration.current,
    enabled: isTemplateGrouped,
  });

  useStatusSummaryRefetch({
    lastMessage,
    refetch: fetchStatusSummaries,
    onCounts: mergeStatusSummaries,
    pageKey: location.search,
    getPageGeneration: () => pageGeneration.current,
    enabled: isStatusGrouped,
  });

  const jobs = isGrouped ? results : wsJobs;

  const page = Number(listParams.page) || 1;
  const pageSize = Number(listParams.page_size) || 20;

  useEffect(() => {
    // A stack forming or dissolving changes the row count.  If the current
    // page no longer exists after a refetch, move to the last valid page.
    if (isLoading || count <= 0 || results.length > 0) return;
    const maxPage = Math.max(1, Math.ceil(count / pageSize));
    if (page <= maxPage) return;
    const next = updateQueryString(qsConfig, location.search, {
      page: maxPage,
    });
    navigate(next ? `${location.pathname}?${next}` : location.pathname, {
      replace: true,
    });
  }, [
    count,
    page,
    pageSize,
    isLoading,
    results.length,
    location.search,
    location.pathname,
    navigate,
    qsConfig,
  ]);

  const getRowKey = useCallback((row: UnifiedJob) => {
    if (row.stack) return `stack:${row.stack.template.id}`;
    if (row.status_group) return `status:${row.status_group.status}`;
    return String(row.id);
  }, []);

  const selectableJobs = useMemo(
    () => jobs.filter((job) => !job.stack && !job.status_group),
    [jobs]
  );
  const expandableJobs = useMemo(
    () => jobs.filter((job) => !job.status_group),
    [jobs]
  );

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(selectableJobs, [], true);

  const { expanded, isAllExpanded, handleExpand, expandAll } = useExpanded(
    expandableJobs,
    getRowKey,
    true
  );

  const selectedIds = useMemo(
    () => new Set(selected.map((row) => row.id)),
    [selected]
  );
  const expandedKeys = useMemo(
    () => new Set(expanded.map(getRowKey)),
    [expanded, getRowKey]
  );

  const {
    error: cancelJobsError,
    isLoading: isCancelLoading,
    request: cancelJobs,
  } = useRequest(
    useCallback(
      async () =>
        Promise.all(
          selected.map((job) => {
            if (isJobRunning(job.status)) {
              return getJobModel(job.type).cancel(job.id);
            }
            return Promise.resolve();
          })
        ),
      [selected]
    ),
    []
  );

  const { error: cancelError, dismissError: dismissCancelError } =
    useDismissableError(cancelJobsError);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteJobs,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map(({ type, id }) => getJobModel(type).destroy(id))
        ),
      [selected]
    ),
    {
      qsConfig,
      allItemsSelected: isAllSelected,
      fetchItems: fetchJobs,
    }
  );

  const handleJobCancel = async () => {
    await cancelJobs();
    clearSelected();
  };

  const handleJobDelete = async () => {
    await deleteJobs();
    clearSelected();
  };

  const cannotDeleteItems = selected.filter((job) => isJobRunning(job.status));

  return (
    <>
      <Card>
        <PaginatedTable
          contentError={contentError}
          hasContentLoading={isLoading || isDeleteLoading || isCancelLoading}
          items={jobs}
          itemCount={count}
          emptyContentMessage={t`Please run a job to populate this list.`}
          pluralizedItemName={t`Jobs`}
          qsConfig={qsConfig}
          toolbarSearchColumns={[
            {
              name: t`Name`,
              key: 'name__icontains',
              isDefault: true,
            },
            {
              name: t`ID`,
              key: 'id',
            },
            {
              name: t`Label Name`,
              key: 'labels__name__icontains',
            },
            {
              name: t`Job Type`,
              key: `or__type`,
              options: [
                [`project_update`, t`Source Control Update`],
                [`inventory_update`, t`Inventory Sync`],
                [`job`, t`Playbook Run`],
                [`ad_hoc_command`, t`Command`],
                [`system_job`, t`Management Job`],
                [`workflow_job`, t`Workflow Job`],
              ],
            },
            {
              name: t`Launched By (Username)`,
              key: 'created_by__username__icontains',
            },
            {
              name: t`Status`,
              key: 'or__status',
              options: [
                [`new`, t`New`],
                [`pending`, t`Pending`],
                [`waiting`, t`Waiting`],
                [`running`, t`Running`],
                [`successful`, t`Successful`],
                [`failed`, t`Failed`],
                [`error`, t`Error`],
                [`canceled`, t`Canceled`],
              ],
            },
            {
              name: t`Limit`,
              key: 'job__limit',
            },
            {
              name: t`Created`,
              key: 'created',
            },
            {
              name: t`Finished`,
              key: 'finished',
            },
          ]}
          headerRow={
            <HeaderRow qsConfig={qsConfig} isExpandable>
              <HeaderCell sortKey="id">{t`ID`}</HeaderCell>
              <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
              <HeaderCell sortKey="status">{t`Status`}</HeaderCell>
              {showTypeColumn && <HeaderCell>{t`Type`}</HeaderCell>}
              <HeaderCell sortKey="started">{t`Start Time`}</HeaderCell>
              <HeaderCell sortKey="finished">{t`Finish Time`}</HeaderCell>
              <HeaderCell>{t`Actions`}</HeaderCell>
            </HeaderRow>
          }
          clearSelected={clearSelected}
          toolbarSearchableKeys={searchableKeys}
          toolbarRelatedSearchableKeys={[
            ...relatedSearchableKeys,
            ...additionalRelatedSearchableKeys,
          ]}
          renderToolbar={(props) => (
            <DatalistToolbar
              {...props}
              isAllExpanded={isAllExpanded}
              onExpandAll={expandAll}
              isAllSelected={isAllSelected}
              onSelectAll={selectAll}
              qsConfig={qsConfig}
              persistentControls={
                showGroupingSelector
                  ? [<GroupBySelect key="group-by" qsConfig={qsConfig} />]
                  : []
              }
              additionalControls={[
                <ToolbarDeleteButton
                  key="delete"
                  onDelete={handleJobDelete}
                  itemsToDelete={selected.map(({ ...item }) => {
                    item.name = `${item.id} - ${item.name}`;
                    return item;
                  })}
                  pluralizedItemName={t`Jobs`}
                  cannotDelete={(item) =>
                    isJobRunning(item.status as string) ||
                    !item.summary_fields?.user_capabilities?.delete
                  }
                  errorMessage={
                    <Plural
                      value={cannotDeleteItems.length}
                      one="The selected job cannot be deleted due to insufficient permission or a running job status"
                      other="The selected jobs cannot be deleted due to insufficient permissions or a running job status"
                    />
                  }
                />,
                <JobListCancelButton
                  key="cancel"
                  onCancel={handleJobCancel}
                  jobsToCancel={selected}
                />,
              ]}
            />
          )}
          renderRow={(job: UnifiedJob, index: number) => (
            <JobListItem
              key={getRowKey(job)}
              inventorySourceLabels={inventorySourceChoices}
              job={job}
              isExpanded={expandedKeys.has(getRowKey(job))}
              onExpand={() => handleExpand(job)}
              isSuperUser={Boolean(me?.is_superuser)}
              showTypeColumn={showTypeColumn}
              onSelect={() => {
                if (!job.stack && !job.status_group) handleSelect(job);
              }}
              isSelected={
                !job.stack && !job.status_group && selectedIds.has(job.id)
              }
              rowIndex={index}
              qsConfig={qsConfig}
              search={location.search}
              params={listParams}
            />
          )}
        />
      </Card>
      {deletionError && (
        <AlertModal
          isOpen
          variant="error"
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more jobs.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
      {cancelError && (
        <AlertModal
          isOpen
          variant="error"
          title={t`Error!`}
          onClose={dismissCancelError}
        >
          {t`Failed to cancel one or more jobs.`}
          <ErrorDetail error={cancelError} />
        </AlertModal>
      )}
    </>
  );
}

export default JobList;
