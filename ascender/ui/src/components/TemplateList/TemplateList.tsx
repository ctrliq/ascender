/*
  Modifications Copyright (c) 2023 Ctrl IQ, Inc.
*/

import React, { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Plural, useLingui } from '@lingui/react/macro';
import { DropdownItem, Tab, Tabs, TabTitleText } from '@patternfly/react-core';

import {
  JobTemplatesAPI,
  UnifiedJobTemplatesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import useExpanded from 'hooks/useExpanded';
import { getQSConfig, parseQueryString, updateQueryString } from 'util/qs';
import useWsTemplates from 'hooks/useWsTemplates';
import useToast, { AlertVariant } from 'hooks/useToast';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import type { QSParams } from 'util/qs';
import AlertModal from '../AlertModal';
import DatalistToolbar from '../DataListToolbar';
import ErrorDetail from '../ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from '../PaginatedTable';
import AddDropDownButton from '../AddDropDownButton';
import TemplateListItem from './TemplateListItem';

/**
 * Every type the list holds, which is what the API is asked for when no tab
 * narrows it. Spelled without a space so it reaches the API as it stands.
 */
const ALL_TYPES = 'job_template,workflow_job_template';
/*
 * The type tabs filter the one list below them rather than switching between
 * panels of their own, so every tab names that list as the panel it controls.
 * Left to itself each tab pointed at a panel of its own that is never drawn,
 * which assistive technology follows to nothing.
 */
const TYPE_PANEL_ID = 'template-type-panel';

export interface TemplateListProps {
  /** Narrows the list, merged into the query string's defaults. */
  defaultParams?: QSParams;
  /** Whether to offer the tabs that narrow the list to one type. */
  hasTypeTabs?: boolean;
  [key: string]: unknown;
}

function TemplateList({ defaultParams, hasTypeTabs }: TemplateListProps) {
  const { t } = useLingui();
  // The type value in const qsConfig below does not have a space between job_template and
  // workflow_job_template so the params sent to the API match what the api expects.
  const qsConfig = getQSConfig(
    'template',
    {
      page: 1,
      page_size: 20,
      order_by: 'name',
      type: 'job_template,workflow_job_template',
      ...defaultParams,
    },
    ['id', 'page', 'page_size']
  );

  const location = useLocation();
  const navigate = useNavigate();
  const { addToast, Toast, toastProps } = useToast();

  const {
    result: {
      results,
      count,
      jtActions,
      wfjtActions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading,
    request: fetchTemplates,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(qsConfig, location.search);
      const responses = await Promise.all([
        UnifiedJobTemplatesAPI.read(params),
        JobTemplatesAPI.readOptions(),
        WorkflowJobTemplatesAPI.readOptions(),
        UnifiedJobTemplatesAPI.readOptions(),
      ]);
      return {
        results: responses[0].data.results,
        count: responses[0].data.count,
        jtActions: responses[1].data.actions,
        wfjtActions: responses[2].data.actions,
        relatedSearchableKeys: (
          responses[3]?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(responses[3].data.actions?.GET),
      };
    }, [location]), // eslint-disable-line react-hooks/exhaustive-deps
    {
      results: [],
      count: 0,
      jtActions: {},
      wfjtActions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const templates = useWsTemplates(results);

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(templates);

  const { expanded, isAllExpanded, handleExpand, expandAll } =
    useExpanded(templates);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteTemplates,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map(({ type, id }) => {
            if (type === 'job_template') {
              return JobTemplatesAPI.destroy(id);
            }
            if (type === 'workflow_job_template') {
              return WorkflowJobTemplatesAPI.destroy(id);
            }
            return false;
          })
        ),
      [selected]
    ),
    {
      qsConfig,
      allItemsSelected: isAllSelected,
      fetchItems: fetchTemplates,
    }
  );

  const handleCopy = useCallback(
    (newTemplateId: number | string) => {
      addToast({
        id: newTemplateId,
        title: t`Template copied successfully`,
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    },
    [addToast, t]
  );

  /*
   * The tabs are the type filter, held in the query string like every other
   * filter on the list rather than in state: a link into the list lands on the
   * tab it asks for, and the back button walks the tabs.
   */
  const { type: activeType } = parseQueryString(qsConfig, location.search);

  const handleTypeSelect = (type: string) => {
    clearSelected();
    const qs = updateQueryString(qsConfig, location.search, {
      type,
      // The tab is the type filter on its own, so the search one goes with it:
      // left behind, it would narrow the tab further by a column the toolbar no
      // longer offers, with only its chip to say so.
      or__type: null,
      page: 1,
    });
    navigate(qs ? `${location.pathname}?${qs}` : location.pathname);
  };

  /** Whether a tab is narrowing the list to one type of its own. */
  const isNarrowedByTab = Boolean(hasTypeTabs) && activeType !== ALL_TYPES;

  const handleTemplateDelete = async () => {
    await deleteTemplates();
    clearSelected();
  };

  const canAddJT =
    jtActions && Object.prototype.hasOwnProperty.call(jtActions, 'POST');
  const canAddWFJT =
    wfjtActions && Object.prototype.hasOwnProperty.call(wfjtActions, 'POST');

  const addTemplate = t`Add Job Template`;
  const addWFTemplate = t`Add Workflow Template`;
  const addDropDownButton = [];
  if (canAddJT) {
    addDropDownButton.push(
      <DropdownItem
        ouiaId="add-job-template-item"
        key={addTemplate}
        onClick={() => navigate('/templates/job_template/add/')}
        aria-label={addTemplate}
      >
        {addTemplate}
      </DropdownItem>
    );
  }
  if (canAddWFJT) {
    addDropDownButton.push(
      <DropdownItem
        ouiaId="add-workflow-job-template-item"
        onClick={() => navigate('/templates/workflow_job_template/add/')}
        key={addWFTemplate}
        aria-label={addWFTemplate}
      >
        {addWFTemplate}
      </DropdownItem>
    );
  }
  /*
   * On a tab there is only one kind of template to add, so the menu that asks
   * which reads as a question already answered: the button goes straight there
   * instead.
   */
  const addButton = isNarrowedByTab ? (
    // Add, as every other list says, rather than naming the kind: the tab above
    // it has already said which, and one word is what the toolbar holds.
    <ToolbarAddButton
      ouiaId="add-template-button"
      key="add"
      linkTo={`/templates/${String(activeType)}/add/`}
      tooltip={
        activeType === 'workflow_job_template'
          ? t`Add Workflow Template`
          : t`Add Job Template`
      }
    />
  ) : (
    <AddDropDownButton
      ouiaId="add-template-button"
      key="add"
      dropdownItems={addDropDownButton}
    />
  );

  /** Whether the add button has anything to offer on the tab that is open. */
  const canAdd = isNarrowedByTab
    ? (activeType === 'job_template' && canAddJT) ||
      (activeType === 'workflow_job_template' && canAddWFJT)
    : canAddJT || canAddWFJT;

  const deleteDetailsRequests = relatedResourceDeleteRequests.template(
    selected[0]
  );

  return (
    <>
      {hasTypeTabs && (
        <Tabs
          aria-label={t`Template types`}
          activeKey={typeof activeType === 'string' ? activeType : ALL_TYPES}
          onSelect={(_event, eventKey) => handleTypeSelect(String(eventKey))}
          ouiaId="template-type-tabs"
        >
          <Tab
            eventKey={ALL_TYPES}
            tabContentId={TYPE_PANEL_ID}
            title={<TabTitleText>{t`All`}</TabTitleText>}
            ouiaId="all-templates-tab"
          />
          <Tab
            eventKey="job_template"
            tabContentId={TYPE_PANEL_ID}
            title={<TabTitleText>{t`Job Templates`}</TabTitleText>}
            ouiaId="job-templates-tab"
          />
          <Tab
            eventKey="workflow_job_template"
            tabContentId={TYPE_PANEL_ID}
            title={<TabTitleText>{t`Workflow Templates`}</TabTitleText>}
            ouiaId="workflow-templates-tab"
          />
        </Tabs>
      )}
      <div
        {...(hasTypeTabs
          ? { id: TYPE_PANEL_ID, role: 'tabpanel', 'aria-label': t`Templates` }
          : {})}
      >
        <PaginatedTable
          contentError={contentError}
          hasContentLoading={isLoading || isDeleteLoading}
          items={templates}
          itemCount={count}
          pluralizedItemName={t`Templates`}
          qsConfig={qsConfig}
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
            // Only where the list holds both: on the other tabs the type is
            // the tab, and a search that could contradict it reads as a bug.
            ...(isNarrowedByTab
              ? []
              : [
                  {
                    name: t`Type`,
                    key: 'or__type',
                    options: [
                      [`job_template`, t`Job Template`],
                      [`workflow_job_template`, t`Workflow Template`],
                    ] as [string, string][],
                  },
                ]),
            {
              name: t`Playbook Name`,
              key: 'job_template__playbook__icontains',
            },
            {
              name: t`Created By (Username)`,
              key: 'created_by__username__icontains',
            },
            {
              name: t`Modified By (Username)`,
              key: 'modified_by__username__icontains',
            },
            {
              name: t`Label`,
              key: 'labels__name__icontains',
            },
          ]}
          toolbarSearchableKeys={searchableKeys}
          toolbarRelatedSearchableKeys={relatedSearchableKeys}
          headerRow={
            <HeaderRow qsConfig={qsConfig} isExpandable>
              <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
              <HeaderCell>{t`Activity`}</HeaderCell>
              <HeaderCell sortKey="last_job_run">{t`Last Ran`}</HeaderCell>
              {/* Only where the list holds both kinds. On the other tabs it
                    is the tab's own answer on every row, and a sort by it puts
                    the rows back where they were. */}
              {isNarrowedByTab ? null : (
                <HeaderCell sortKey="type">{t`Type`}</HeaderCell>
              )}
              <HeaderCell>{t`Actions`}</HeaderCell>
            </HeaderRow>
          }
          renderToolbar={(props) => (
            <DatalistToolbar
              {...props}
              isAllSelected={isAllSelected}
              onSelectAll={selectAll}
              isAllExpanded={isAllExpanded}
              onExpandAll={expandAll}
              qsConfig={qsConfig}
              additionalControls={[
                ...(canAdd ? [addButton] : []),
                <ToolbarDeleteButton
                  key="delete"
                  onDelete={handleTemplateDelete}
                  itemsToDelete={selected}
                  pluralizedItemName={t`Templates`}
                  deleteDetailsRequests={deleteDetailsRequests}
                  deleteMessage={
                    <Plural
                      value={selected.length}
                      one="This template is currently being used by some workflow nodes. Are you sure you want to delete it?"
                      other="Deleting these templates could impact some workflow nodes that rely on them. Are you sure you want to delete anyway?"
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
              hasTypeColumn={!isNarrowedByTab}
            />
          )}
        />
      </div>
      <Toast {...toastProps} />
      <AlertModal
        aria-label={t`Deletion Error`}
        isOpen={Boolean(deletionError)}
        variant="error"
        title={t`Error!`}
        onClose={clearDeletionError}
      >
        {t`Failed to delete one or more templates.`}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default TemplateList;
