import type { UnifiedJob } from 'types/api';
import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router';
import { useLingui, Plural } from '@lingui/react/macro';

import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import useExpanded from 'hooks/useExpanded';
import { canDeleteJob, getJobModel, isJobCancelable } from 'util/jobs';
import type { QSParams } from 'util/qs';
import { getQSConfig, parseQueryString } from 'util/qs';
import { UnifiedJobsAPI, InventorySourcesAPI } from 'api';
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
import RunMenu from './RunMenu';
import useWsJobs from './useWsJobs';

export interface JobListProps {
  /** Narrows the list to one resource's jobs, merged into the query string. */
  defaultParams?: QSParams;
  showTypeColumn?: boolean;
  /**
   * Keeps the runs another run started for itself, which the list otherwise
   * leaves out: a project or inventory source's own tab, where the updates a
   * job launch triggered are most of its history rather than noise.
   */
  includeDependencySyncs?: boolean;
  /**
   * What starts a run from this list. A resource's runs tab passes its own,
   * launch this template or sync this project, so Run means this one rather
   * than a menu of everything; without it the list offers the runs screen's
   * menu, which asks what to run. False leaves the toolbar without one.
   */
  runControl?: React.ReactNode;
  additionalRelatedSearchableKeys?: string[];
  [key: string]: unknown;
}

/** The choice filters that may hold several ticked options at once. */
const CHOICE_FIELDS = ['status', 'type'];

/**
 * The query with each choice filter that holds several options as one list.
 *
 * Repeated plain clauses, status=a&status=b, are ANDed by the API and match
 * nothing, while status__in=a,b matches either. The API ORs every or__ clause
 * in a query into a single group, so the or__status and or__type these filters
 * used to send joined each other and any or__ defaults: Type of Job with Status
 * of Failed asked for every job and every failed run. An address saved from
 * then still carries those keys, and they are folded into the plain ones here
 * so it reads as it was meant to rather than as the API would read it.
 *
 * Args:
 *   params: The query as parsed from the address.
 *
 * Returns:
 *   A copy of the query, with status and type sent as one plain clause where
 *   one option is ticked and as an __in list wherever more than one is, and
 *   no or__status or or__type left in it.
 */
export function asChoiceLists(params: QSParams): QSParams {
  const next: QSParams = { ...params };
  CHOICE_FIELDS.forEach((field) => {
    const legacyKey = `or__${field}`;
    const values = [next[field], next[legacyKey]]
      .flat()
      .filter((value) => value !== undefined && value !== null && value !== '');
    delete next[legacyKey];
    const unique = [...new Set(values.map(String))];
    if (unique.length > 1) {
      delete next[field];
      next[`${field}__in`] = unique.join(',');
    } else if (unique.length === 1) {
      next[field] = unique[0] as string;
    }
  });
  return next;
}

function JobList({
  defaultParams,
  showTypeColumn = false,
  includeDependencySyncs = false,
  runControl,
  additionalRelatedSearchableKeys = [],
}: JobListProps) {
  const { t } = useLingui();
  const qsConfig = getQSConfig(
    'job',
    {
      page: 1,
      page_size: 20,
      order_by: '-finished',
      ...(includeDependencySyncs ? {} : { not__launch_type: 'sync' }),
      ...defaultParams,
    },
    ['id', 'page', 'page_size'],
    ['created', 'modified', 'finished']
  );

  const location = useLocation();
  const {
    result: {
      results,
      count,
      relatedSearchableKeys,
      searchableKeys,
      inventorySourceChoices,
    },
    error: contentError,
    isLoading,
    request: fetchJobs,
  } = useRequest(
    useCallback(
      async () => {
        const params = asChoiceLists(
          parseQueryString(qsConfig, location.search)
        );
        const [response, actionsResponse, { data: inventorySourceOptions }] =
          await Promise.all([
            UnifiedJobsAPI.read({ ...params }),
            UnifiedJobsAPI.readOptions(),
            InventorySourcesAPI.readOptions(),
          ]);

        return {
          results: response.data.results,
          count: response.data.count,
          inventorySourceChoices:
            inventorySourceOptions.actions.GET?.source?.choices ?? [],
          relatedSearchableKeys: (
            actionsResponse.data.related_search_fields || []
          ).map((val) => val.slice(0, -8)),
          searchableKeys: getSearchableKeys(actionsResponse.data.actions.GET),
        };
      },
      [location] // eslint-disable-line react-hooks/exhaustive-deps
    ),
    {
      results: [],
      count: 0,
      inventorySourceChoices: [],
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );
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
      const params = asChoiceLists(parseQueryString(qsConfig, location.search));
      params.id__in = ids.join(',');
      try {
        const { data } = await UnifiedJobsAPI.read(params);
        if (!isMounted.current) return [];
        return data.results;
      } catch (e) {
        return [];
      }
    },
    [location.search] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const jobs = useWsJobs(results, fetchJobsById, qsConfig);

  const {
    selected: selectedSnapshots,
    isAllSelected,
    handleSelect,
    selectAll,
    clearSelected,
  } = useSelected(jobs);

  // useSelected keeps a copy of each row as it was when it was ticked, while
  // the websocket moves the rows in jobs on. Reading the selection back from
  // jobs by id keeps the toolbar's Cancel and Delete deciding on the status a
  // run has now, not the one it had then. A row that has since left the page
  // keeps its last known copy.
  const selected = useMemo(
    () =>
      selectedSnapshots.map(
        (row) => jobs.find((job) => job.id === row.id) ?? row
      ),
    [selectedSnapshots, jobs]
  );

  const { expanded, isAllExpanded, handleExpand, expandAll } =
    useExpanded(jobs);

  const {
    error: cancelJobsError,
    isLoading: isCancelLoading,
    request: cancelJobs,
  } = useRequest(
    useCallback(
      async () =>
        Promise.all(
          selected.map((job) => {
            if (isJobCancelable(job.status)) {
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

  // A new run may be deleted as well as a finished one, as the api allows;
  // the same helper decides it on the details page and the output toolbars.
  const cannotDeleteItems = selected.filter((job) => !canDeleteJob(job));

  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || isDeleteLoading || isCancelLoading}
        items={jobs}
        itemCount={count}
        emptyContentMessage={t`Please run a job to populate this list`}
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
            // The column it filters says Type, so the key that picks it does.
            name: t`Type`,
            key: 'type',
            /* In the order the Run button offers the same six, so the
                 kinds of run read the same way whichever end they are
                 reached from. */
            options: [
              [`job`, t`Job`],
              [`workflow_job`, t`Workflow`],
              [`ad_hoc_command`, t`Command`],
              [`inventory_update`, t`Inventory Sync`],
              [`project_update`, t`Project Sync`],
              [`system_job`, t`Cleanup Job`],
            ],
          },
          {
            name: t`Launched By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Status`,
            key: 'status',
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
            additionalControls={[
              // Left out rather than rendered empty: the toolbar wraps each
              // control in an item of its own, and an empty one still takes
              // up a slot and a gap.
              ...(runControl === false
                ? []
                : [
                    <React.Fragment key="run">
                      {runControl ?? <RunMenu />}
                    </React.Fragment>,
                  ]),
              <JobListCancelButton
                key="cancel"
                onCancel={handleJobCancel}
                jobsToCancel={selected}
              />,
              <ToolbarDeleteButton
                key="delete"
                onDelete={handleJobDelete}
                itemsToDelete={selected.map(({ ...item }) => {
                  item.name = `${item.id} - ${item.name}`;
                  return item;
                })}
                pluralizedItemName={t`Jobs`}
                cannotDelete={(item) => !canDeleteJob(item)}
                errorMessage={
                  <Plural
                    value={cannotDeleteItems.length}
                    one="The selected job cannot be deleted due to insufficient permission or a running job status"
                    other="The selected jobs cannot be deleted due to insufficient permissions or a running job status"
                  />
                }
              />,
            ]}
          />
        )}
        renderRow={(job: UnifiedJob, index: number) => (
          <JobListItem
            key={job.id}
            inventorySourceLabels={inventorySourceChoices}
            job={job}
            isExpanded={expanded.some((row) => row.id === job.id)}
            onExpand={() => handleExpand(job)}
            showTypeColumn={showTypeColumn}
            onSelect={() => handleSelect(job)}
            isSelected={selected.some((row) => row.id === job.id)}
            rowIndex={index}
          />
        )}
      />
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
