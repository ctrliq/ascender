import React, { useCallback, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';

import { msg, Plural } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Card } from '@patternfly/react-core';
import { JobTemplatesAPI } from 'api';
import AlertModal from 'components/AlertModal';
import DatalistToolbar from 'components/DataListToolbar';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import {
  getQSConfig,
  parseQueryString,
  mergeParams,
  encodeQueryString,
} from 'util/qs';
import useWsTemplates from 'hooks/useWsTemplates';
import useSelected from 'hooks/useSelected';
import useExpanded from 'hooks/useExpanded';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import { TemplateListItem } from 'components/TemplateList';
import useToast, { AlertVariant } from 'hooks/useToast';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';

const QS_CONFIG = getQSConfig('template', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

const resources = {
  projects: 'project',
  inventories: 'inventory',
  credentials: 'credentials',
};

function RelatedTemplateList({ searchParams, resourceName = null }) {
  const { i18n } = useLingui();
  const { id } = useParams();
  const location = useLocation();
  const { addToast, Toast, toastProps } = useToast();

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
    request: fetchTemplates,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        JobTemplatesAPI.read(mergeParams(params, searchParams)),
        JobTemplatesAPI.readOptions(),
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
    }, [location]), // eslint-disable-line react-hooks/exhaustive-deps
    {
      results: [],
      itemCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const jobTemplates = useWsTemplates(results);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(jobTemplates);

  const { expanded, isAllExpanded, handleExpand, expandAll } =
    useExpanded(jobTemplates);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteTemplates,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map((template) => JobTemplatesAPI.destroy(template.id))
        ),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchTemplates,
    }
  );

  const handleCopy = useCallback(
    (newTemplateId) => {
      addToast({
        id: newTemplateId,
        title: i18n._(msg`Template copied successfully`),
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    },
    [addToast, i18n]
  );

  const handleTemplateDelete = async () => {
    await deleteTemplates();
    clearSelected();
  };

  const canAddJT =
    actions && Object.prototype.hasOwnProperty.call(actions, 'POST');

  let linkTo = '';
  if (resourceName) {
    const queryString = {
      resource_id: id,
      resource_name: resourceName,
      resource_type: resources[location.pathname.split('/')[1]],
      resource_kind: null,
    };
    if (Array.isArray(resourceName)) {
      const [name, kind] = resourceName;
      queryString.resource_name = name;
      queryString.resource_kind = kind;
    }
    const qs = encodeQueryString(queryString);
    linkTo = `/templates/job_template/add/?${qs}`;
  } else {
    linkTo = '/templates/job_template/add';
  }
  const addButton = <ToolbarAddButton key="add" linkTo={linkTo} />;

  const deleteDetailsRequests = relatedResourceDeleteRequests.template(
    selected[0]
  );

  return (
    <>
      <Card>
        <PaginatedTable
          contentError={contentError}
          hasContentLoading={isDeleteLoading || isLoading}
          items={jobTemplates}
          itemCount={itemCount}
          pluralizedItemName={i18n._(msg`Job templates`)}
          qsConfig={QS_CONFIG}
          clearSelected={clearSelected}
          toolbarSearchColumns={[
            {
              name: i18n._(msg`Name`),
              key: 'name__icontains',
              isDefault: true,
            },
            {
              name: i18n._(msg`Created By (Username)`),
              key: 'created_by__username__icontains',
            },
            {
              name: i18n._(msg`Modified By (Username)`),
              key: 'modified_by__username__icontains',
            },
            {
              name: i18n._(msg`Playbook name`),
              key: 'job_template__playbook__icontains',
            },
            {
              name: i18n._(msg`Label`),
              key: 'labels__name__icontains',
            },
          ]}
          toolbarSearchableKeys={searchableKeys}
          toolbarRelatedSearchableKeys={relatedSearchableKeys}
          headerRow={
            <HeaderRow qsConfig={QS_CONFIG} isExpandable>
              <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
              <HeaderCell sortKey="type">{i18n._(msg`Type`)}</HeaderCell>
              <HeaderCell>{i18n._(msg`Recent jobs`)}</HeaderCell>
              <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
            </HeaderRow>
          }
          renderToolbar={(props) => (
            <DatalistToolbar
              {...props}
              isAllSelected={isAllSelected}
              onSelectAll={selectAll}
              isAllExpanded={isAllExpanded}
              onExpandAll={expandAll}
              qsConfig={QS_CONFIG}
              additionalControls={[
                ...(canAddJT ? [addButton] : []),
                <ToolbarDeleteButton
                  key="delete"
                  onDelete={handleTemplateDelete}
                  itemsToDelete={selected}
                  pluralizedItemName={i18n._(msg`Job templates`)}
                  deleteDetailsRequests={deleteDetailsRequests}
                  deleteMessage={
                    <Plural
                      value={selected.length}
                      one={i18n._(msg`This template is currently being used by some workflow nodes. Are you sure you want to delete it?`)}
                      other={i18n._(msg`Deleting these templates could impact some workflow nodes that rely on them. Are you sure you want to delete anyway?`)}
                    />
                  }
                />,
              ]}
            />
          )}
          renderRow={(template, index) => (
            <TemplateListItem
              key={template.id}
              value={template.name}
              template={template}
              detailUrl={`/templates/${template.type}/${template.id}`}
              onSelect={() => handleSelect(template)}
              isExpanded={expanded.some((row) => row.id === template.id)}
              onExpand={() => handleExpand(template)}
              onCopy={handleCopy}
              isSelected={selected.some((row) => row.id === template.id)}
              fetchTemplates={fetchTemplates}
              rowIndex={index}
            />
          )}
          emptyStateControls={canAddJT && addButton}
        />
      </Card>
      <Toast {...toastProps} />
      <AlertModal
        isOpen={deletionError}
        variant="danger"
        title={i18n._(msg`Error!`)}
        onClose={clearDeletionError}
      >
        {i18n._(msg`Failed to delete one or more job templates.`)}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default RelatedTemplateList;
