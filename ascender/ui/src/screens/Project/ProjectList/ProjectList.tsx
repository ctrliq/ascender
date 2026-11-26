import type { Project } from 'types/api';
import React, { useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { Plural, useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { ProjectsAPI } from 'api';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems, useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal';
import DataListToolbar from 'components/DataListToolbar';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  ToolbarSyncButton,
  getSearchableKeys,
  getSearchFilters,
  readEveryPage,
} from 'components/PaginatedTable';
import useSelected from 'hooks/useSelected';
import useExpanded from 'hooks/useExpanded';
import useToast, { AlertVariant } from 'hooks/useToast';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import { getQSConfig, parseQueryString } from 'util/qs';
import useWsProjects from './useWsProjects';

import ProjectListItem from './ProjectListItem';

const QS_CONFIG = getQSConfig('project', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

/* The projects that have somewhere to sync from: a manual project has no
   source control, and its scm_type is empty. */
const SYNCABLE = { not__scm_type: '' };

function ProjectList() {
  const { t } = useLingui();
  const location = useLocation();
  const { addToast, Toast, toastProps } = useToast();

  const [fetchUpdatedProjectError, setFetchUpdatedProjectError] =
    useState<unknown>(null);

  /* The websocket names a project whose sync ended, and the list reads that
     one project back. Every call is a request of its own rather than a shared
     useRequest, which keeps only its latest answer: two syncs ending together
     would otherwise lose the first project's read, and leave its row showing
     Syncing. useWsProjects merges each answer into its row by id. */
  const fetchUpdatedProject = useCallback(
    async (projectId: number): Promise<Project | null> => {
      if (!projectId) {
        return null;
      }
      try {
        const { data } = await ProjectsAPI.readDetail(projectId);
        return data;
      } catch (error) {
        setFetchUpdatedProjectError(error);
        return null;
      }
    },
    []
  );

  const {
    result: {
      results,
      itemCount,
      sourcedCount,
      syncableCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading,
    request: fetchProjects,
  } = useCachedRequest(
    ['project-list', location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      /* The counts are taken within the search, as Sync All reads within
         it, so the button never offers what the list in front of the reader
         has filtered out. */
      const searchFilters = getSearchFilters(QS_CONFIG, location.search);
      const [response, actionsResponse, sourced, syncable] = await Promise.all([
        ProjectsAPI.read(params),
        ProjectsAPI.readOptions(),
        /* How many could be synced at all, which is what says whether the
             sync button does anything: a manual project has nothing to pull
             from, and a new installation has no projects. */
        ProjectsAPI.read({ ...searchFilters, ...SYNCABLE, page_size: 1 }),
        /* And how many of those this reader may start, which is the
             project's update role, the same one the api checks on a sync. */
        ProjectsAPI.read({
          ...searchFilters,
          ...SYNCABLE,
          role_level: 'update_role',
          page_size: 1,
        }),
      ]);
      return {
        results: response.data.results,
        itemCount: response.data.count,
        sourcedCount: sourced.data.count,
        syncableCount: syncable.data.count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      results: [],
      itemCount: 0,
      sourcedCount: 0,
      syncableCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const projects = useWsProjects(results, fetchUpdatedProject);

  // The search in force, which Sync All and its counts read within.
  const searchFilters = getSearchFilters(QS_CONFIG, location.search);

  const {
    selected,
    isAllSelected,
    handleSelect,
    setSelected,
    selectAll,
    clearSelected,
  } = useSelected(projects);

  const { expanded, isAllExpanded, handleExpand, expandAll } =
    useExpanded(projects);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteProjects,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () => Promise.all(selected.map(({ id }) => ProjectsAPI.destroy(id))),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchProjects,
    }
  );

  const handleCopy = useCallback(
    (newId: number) => {
      addToast({
        id: newId,
        title: t`Project copied successfully`,
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    },
    [addToast, t]
  );

  const handleProjectDelete = async () => {
    await deleteProjects();
    setSelected([]);
  };

  const hasContentLoading = isDeleteLoading || isLoading;
  const canAdd = actions && actions.POST;

  const deleteDetailsRequests = relatedResourceDeleteRequests.project(
    selected[0]
  );

  const { error: projectError, dismissError: dismissProjectError } =
    useDismissableError(fetchUpdatedProjectError);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Card>
          <PaginatedTable
            contentError={contentError}
            hasContentLoading={hasContentLoading}
            items={projects}
            itemCount={itemCount}
            pluralizedItemName={t`Projects`}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Description`,
                key: 'description__icontains',
              },
              {
                name: t`Type`,
                key: 'or__scm_type',
                options: [
                  [``, t`Manual`],
                  [`git`, t`Git`],
                  [`svn`, t`Subversion`],
                  [`archive`, t`Remote Archive`],
                ],
              },
              {
                name: t`Source Control URL`,
                key: 'scm_url__icontains',
              },
              {
                name: t`Modified By (Username)`,
                key: 'modified_by__username__icontains',
              },
              {
                name: t`Created By (Username)`,
                key: 'created_by__username__icontains',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG} isExpandable>
                <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
                <HeaderCell>{t`Status`}</HeaderCell>
                <HeaderCell>{t`Type`}</HeaderCell>
                <HeaderCell>{t`Revision`}</HeaderCell>
                <HeaderCell>{t`Actions`}</HeaderCell>
              </HeaderRow>
            }
            renderToolbar={(props) => (
              <DataListToolbar
                {...props}
                isAllExpanded={isAllExpanded}
                onExpandAll={expandAll}
                isAllSelected={isAllSelected}
                onSelectAll={selectAll}
                qsConfig={QS_CONFIG}
                additionalControls={[
                  ...(canAdd
                    ? [
                        <ToolbarAddButton
                          key="add"
                          linkTo={`${location.pathname}/add`}
                          tooltip={t`Add Project`}
                        />,
                      ]
                    : []),
                  <ToolbarDeleteButton
                    key="delete"
                    onDelete={handleProjectDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={t`Projects`}
                    deleteDetailsRequests={deleteDetailsRequests}
                    deleteMessage={
                      <Plural
                        value={selected.length}
                        one="This project is currently being used by other resources. Are you sure you want to delete it?"
                        other="Deleting these projects could impact other resources that rely on them. Are you sure you want to delete anyway?"
                      />
                    }
                  />,
                  <ToolbarSyncButton
                    key="sync"
                    itemsToSync={selected}
                    syncableCount={syncableCount}
                    sourcedCount={sourcedCount}
                    hasSource={(project) => Boolean(project.scm_type)}
                    canSync={(project) =>
                      Boolean(project.scm_type) &&
                      Boolean(project.summary_fields?.user_capabilities?.start)
                    }
                    /* Every project the search matches that this reader may
                       sync, every page of it, not only the first. */
                    readSyncable={() =>
                      readEveryPage((params) => ProjectsAPI.read(params), {
                        ...searchFilters,
                        ...SYNCABLE,
                        role_level: 'update_role',
                      })
                    }
                    isSearched={Object.keys(searchFilters).length > 0}
                    sync={(project) => ProjectsAPI.sync(project.id)}
                    pluralizedItemName={t`Projects`}
                  />,
                ]}
              />
            )}
            renderRow={(project, index) => (
              <ProjectListItem
                isExpanded={expanded.some((row) => row.id === project.id)}
                onExpand={() => handleExpand(project)}
                fetchProjects={fetchProjects}
                key={project.id}
                project={project}
                detailUrl={`${location.pathname}/${project.id}`}
                isSelected={selected.some((row) => row.id === project.id)}
                onSelect={() => handleSelect(project)}
                onCopy={handleCopy}
                rowIndex={index}
              />
            )}
          />
        </Card>
      </PageSection>
      <Toast {...toastProps} />
      {Boolean(deletionError) && (
        <AlertModal
          isOpen={Boolean(deletionError)}
          variant="error"
          aria-label={t`Deletion Error`}
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more projects.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
      {projectError && (
        <AlertModal
          isOpen={projectError}
          variant="error"
          aria-label={t`Error fetching updated project`}
          title={t`Error!`}
          onClose={dismissProjectError}
        >
          {t`Failed to fetch the updated project data.`}
          <ErrorDetail error={projectError} />
        </AlertModal>
      )}
    </>
  );
}

export default ProjectList;
