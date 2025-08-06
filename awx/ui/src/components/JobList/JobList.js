import React, { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { t, Plural } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';

import { Card } from '@patternfly/react-core';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import useSelected from 'hooks/useSelected';
import useExpanded from 'hooks/useExpanded';
import { isJobRunning, getJobModel } from 'util/jobs';
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
import useWsJobs from './useWsJobs';

function JobList({
  defaultParams,
  showTypeColumn = false,
  additionalRelatedSearchableKeys = [],
}) {
  const { i18n } = useLingui();
  const qsConfig = getQSConfig(
    'job',
    {
      page: 1,
      page_size: 20,
      order_by: '-finished',
      not__launch_type: 'sync',
      ...defaultParams,
    },
    ['id', 'page', 'page_size']
  );

  const { me } = useConfig();
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
        const params = parseQueryString(qsConfig, location.search);
        const [
          response,
          actionsResponse,
          {
            data: {
              actions: {
                GET: {
                  source: { choices },
                },
              },
            },
          },
        ] = await Promise.all([
          UnifiedJobsAPI.read({ ...params }),
          UnifiedJobsAPI.readOptions(),
          InventorySourcesAPI.readOptions(),
        ]);

        return {
          results: response.data.results,
          count: response.data.count,
          inventorySourceChoices: choices,
          relatedSearchableKeys: (
            actionsResponse?.data?.related_search_fields || []
          ).map((val) => val.slice(0, -8)),
          searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
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
    async (ids) => {
      const params = parseQueryString(qsConfig, location.search);
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

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(jobs);

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
            if (isJobRunning(job.status)) {
              return getJobModel(job.type).cancel(job.id);
            }
            return Promise.resolve();
          })
        ),
      [selected]
    ),
    {}
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
          emptyContentMessage={i18n._(
            t`Please run a job to populate this list.`
          )}
          pluralizedItemName={i18n._(t`Jobs`)}
          qsConfig={qsConfig}
          toolbarSearchColumns={[
            {
              name: i18n._(t`Name`),
              key: 'name__icontains',
              isDefault: true,
            },
            {
              name: i18n._(t`ID`),
              key: 'id',
            },
            {
              name: i18n._(t`Label Name`),
              key: 'labels__name__icontains',
            },
            {
              name: i18n._(t`Job Type`),
              key: `or__type`,
              options: [
                [`project_update`, i18n._(t`Source Control Update`)],
                [`inventory_update`, i18n._(t`Inventory Sync`)],
                [`job`, i18n._(t`Playbook Run`)],
                [`ad_hoc_command`, i18n._(t`Command`)],
                [`system_job`, i18n._(t`Management Job`)],
                [`workflow_job`, i18n._(t`Workflow Job`)],
              ],
            },
            {
              name: i18n._(t`Launched By (Username)`),
              key: 'created_by__username__icontains',
            },
            {
              name: i18n._(t`Status`),
              key: 'or__status',
              options: [
                [`new`, i18n._(t`New`)],
                [`pending`, i18n._(t`Pending`)],
                [`waiting`, i18n._(t`Waiting`)],
                [`running`, i18n._(t`Running`)],
                [`successful`, i18n._(t`Successful`)],
                [`failed`, i18n._(t`Failed`)],
                [`error`, i18n._(t`Error`)],
                [`canceled`, i18n._(t`Canceled`)],
              ],
            },
            {
              name: i18n._(t`Limit`),
              key: 'job__limit',
            },
          ]}
          headerRow={
            <HeaderRow qsConfig={qsConfig} isExpandable>
              <HeaderCell sortKey="name">{i18n._(t`Name`)}</HeaderCell>
              <HeaderCell sortKey="status">{i18n._(t`Status`)}</HeaderCell>
              {showTypeColumn && <HeaderCell>{i18n._(t`Type`)}</HeaderCell>}
              <HeaderCell sortKey="started">
                {i18n._(t`Start Time`)}
              </HeaderCell>
              <HeaderCell sortKey="finished">
                {i18n._(t`Finish Time`)}
              </HeaderCell>
              <HeaderCell>{i18n._(t`Actions`)}</HeaderCell>
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
                <ToolbarDeleteButton
                  key="delete"
                  onDelete={handleJobDelete}
                  itemsToDelete={selected.map(({ ...item }) => {
                    item.name = `${item.id} - ${item.name}`;
                    return item;
                  })}
                  pluralizedItemName={i18n._(t`Jobs`)}
                  cannotDelete={(item) =>
                    isJobRunning(item.status) ||
                    !item.summary_fields.user_capabilities.delete
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
          renderRow={(job, index) => (
            <JobListItem
              key={job.id}
              inventorySourceLabels={inventorySourceChoices}
              job={job}
              isExpanded={expanded.some((row) => row.id === job.id)}
              onExpand={() => handleExpand(job)}
              isSuperUser={me?.is_superuser}
              showTypeColumn={showTypeColumn}
              onSelect={() => handleSelect(job)}
              isSelected={selected.some((row) => row.id === job.id)}
              rowIndex={index}
            />
          )}
        />
      </Card>
      {deletionError && (
        <AlertModal
          isOpen
          variant="error"
          title={i18n._(t`Error!`)}
          onClose={clearDeletionError}
        >
          {i18n._(t`Failed to delete one or more jobs.`)}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
      {cancelError && (
        <AlertModal
          isOpen
          variant="error"
          title={i18n._(t`Error!`)}
          onClose={dismissCancelError}
        >
          {i18n._(t`Failed to cancel one or more jobs.`)}
          <ErrorDetail error={cancelError} />
        </AlertModal>
      )}
    </>
  );
}

export default JobList;
