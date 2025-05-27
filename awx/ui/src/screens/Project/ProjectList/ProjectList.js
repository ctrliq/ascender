import React, { useEffect, useCallback } from 'react';
import { useLocation, useRouteMatch } from 'react-router-dom';
import { msg, Plural } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Card, PageSection } from '@patternfly/react-core';
import { ProjectsAPI } from 'api';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import AlertModal from 'components/AlertModal';
import DataListToolbar from 'components/DataListToolbar';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
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

function ProjectList() {
  const { i18n } = useLingui();
  const location = useLocation();
  const match = useRouteMatch();
  const { addToast, Toast, toastProps } = useToast();

  const {
    request: fetchUpdatedProject,
    error: fetchUpdatedProjectError,
    result: updatedProject,
  } = useRequest(
    useCallback(async (projectId) => {
      if (!projectId) {
        return {};
      }
      const { data } = await ProjectsAPI.readDetail(projectId);
      return data;
    }, []),
    null
  );

  const {
    result: {
      results,
      itemCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading,
    request: fetchProjects,
    setValue: setProjects,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        ProjectsAPI.read(params),
        ProjectsAPI.readOptions(),
      ]);
      return {
        results: response.data.results,
        itemCount: response.data.count,
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
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const projects = useWsProjects(results);

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
    (newId) => {
      addToast({
        id: newId,
        title: i18n._(msg`Project copied successfully`),
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    },
    [addToast, i18n]
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

  useEffect(() => {
    if (updatedProject) {
      const updatedProjects = projects.map((project) =>
        project.id === updatedProject.id ? updatedProject : project
      );
      setProjects({
        results: updatedProjects,
        itemCount,
        actions,
        relatedSearchableKeys,
        searchableKeys,
      });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [updatedProject]);

  const { error: projectError, dismissError: dismissProjectError } =
    useDismissableError(fetchUpdatedProjectError);

  return (
    <>
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={contentError}
            hasContentLoading={hasContentLoading}
            items={projects}
            itemCount={itemCount}
            pluralizedItemName={i18n._(msg`Projects`)}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchColumns={[
              {
                name: i18n._(msg`Name`),
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: i18n._(msg`Description`),
                key: 'description__icontains',
              },
              {
                name: i18n._(msg`Type`),
                key: 'or__scm_type',
                options: [
                  [``, i18n._(msg`Manual`)],
                  [`gii18n._(msg`, i18n._(msg`Gii18n._(msg`)],
                  [`svn`, i18n._(msg`Subversion`)],
                  [`archive`, i18n._(msg`Remote Archive`)],
                  [`insights`, i18n._(msg`Red Hat Insights`)],
                ],
              },
              {
                name: i18n._(msg`Source Control URL`),
                key: 'scm_url__icontains',
              },
              {
                name: i18n._(msg`Modified By (Username)`),
                key: 'modified_by__username__icontains',
              },
              {
                name: i18n._(msg`Created By (Username)`),
                key: 'created_by__username__icontains',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG} isExpandable>
                <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Status`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Type`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Revision`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
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
                          linkTo={`${match.url}/add`}
                        />,
                      ]
                    : []),
                  <ToolbarDeleteButton
                    key="delete"
                    onDelete={handleProjectDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={i18n._(msg`Projects`)}
                    deleteDetailsRequests={deleteDetailsRequests}
                    deleteMessage={
                      <Plural
                        value={selected.length}
                        one="This project is currently being used by other resources. Are you sure you want to delete it?"
                        other="Deleting these projects could impact other resources that rely on them. Are you sure you want to delete anyway?"
                      />
                    }
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
                detailUrl={`${match.url}/${project.id}`}
                isSelected={selected.some((row) => row.id === project.id)}
                onSelect={() => handleSelect(project)}
                onCopy={handleCopy}
                rowIndex={index}
                onRefreshRow={(projectId) => fetchUpdatedProject(projectId)}
              />
            )}
            emptyStateControls={
              canAdd ? (
                <ToolbarAddButton key="add" linkTo={`${match.url}/add`} />
              ) : null
            }
          />
        </Card>
      </PageSection>
      <Toast {...toastProps} />
      {deletionError && (
        <AlertModal
          isOpen={deletionError}
          variant="error"
          aria-label={i18n._(msg`Deletion Error`)}
          title={i18n._(msg`Error!`)}
          onClose={clearDeletionError}
        >
          {i18n._(msg`Failed to delete one or more projects.`)}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
      {projectError && (
        <AlertModal
          isOpen={projectError}
          variant="error"
          aria-label={i18n._(msg`Error fetching updated project`)}
          title={i18n._(msg`Error!`)}
          onClose={dismissProjectError}
        >
          {i18n._(msg`Failed to fetch the updated project data.`)}
          <ErrorDetail error={projectError} />
        </AlertModal>
      )}
    </>
  );
}

export default ProjectList;
