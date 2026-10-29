import type { AnyUnifiedJobTemplate } from 'types/api';
import React, { useCallback } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import type { QSParams } from 'util/qs';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import CheckboxListItem from 'components/CheckboxListItem';
import DataListToolbar from 'components/DataListToolbar';
import Popover from 'components/Popover';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  getSearchableKeys,
} from 'components/PaginatedTable';

/**
 * The inventory a template is stuck with, which is the one the run will
 * happen in: the api takes an inventory at launch only from a template that
 * prompts for one, so the rest keep their own whatever the run is aimed at.
 * Blank where the template prompts, since then the run uses what was ticked.
 */
const fixedInventory = (item: AnyUnifiedJobTemplate) =>
  item.ask_inventory_on_launch
    ? ''
    : ((item.summary_fields as { inventory?: { name?: string } })?.inventory
        ?.name ?? '');

/**
 * Its own namespace, so paging this list leaves the runs behind it where they
 * were: both read the query string, and both would answer to `page`.
 */
const QS_CONFIG = getQSConfig(
  'run-template',
  {
    page: 1,
    // What fits the step without scrolling it, and what the step before
    // it shows, so the wizard keeps its height.
    page_size: 5,
    order_by: 'name',
  },
  ['id', 'page', 'page_size']
);

export interface RunTemplateStepProps {
  /** The template to run, absent until one is picked. */
  template: AnyUnifiedJobTemplate | null;
  onSelect: (template: AnyUnifiedJobTemplate | null) => void;
  /**
   * Which kind of template to list. The run menus ask for one kind at a
   * time, since a job and a workflow are two things to run.
   */
  templateType?: string;
  /**
   * The inventories the run is aimed at, where the caller named any: the api
   * takes an inventory at launch only from a template that prompts for one,
   * so a template stuck with another inventory could not be run on what was
   * ticked and is not listed at all.
   */
  aimedAtInventoryIds?: number[];
  /**
   * Leaves out every template that would ignore a limit. The api takes a limit
   * only from a template configured to prompt for one, so where the run is
   * aimed at particular hosts the rest are not options: they would run on the
   * whole inventory without saying so.
   */
  mustAcceptLimit?: boolean;
}

/**
 * The wizard's first step: which template to run.
 *
 * Only what the account may start, which is what role_level asks the api for:
 * a template that cannot be launched is not an option, it is a dead end two
 * steps later.
 */
function RunTemplateStep({
  template,
  onSelect,
  mustAcceptLimit = false,
  aimedAtInventoryIds = [],
  templateType = 'job_template',
}: RunTemplateStepProps) {
  const { t } = useLingui();
  const location = useLocation();
  const api =
    templateType === 'workflow_job_template'
      ? WorkflowJobTemplatesAPI
      : JobTemplatesAPI;
  /* One inventory is one the run can be pinned to; several are several runs,
     and only a template that asks for one can be pointed at each. */
  const [onlyInventory] =
    aimedAtInventoryIds.length === 1 ? aimedAtInventoryIds : [];
  /*
   * A run aimed at an inventory leaves out whatever is stuck with another
   * one. A template with no inventory of its own is stuck with nothing, which
   * is every workflow that leaves its nodes to say where they run.
   *
   * Held rather than built in the read below, since the list of inventories
   * is a new array on every render and the read is keyed on what it asks for.
   */
  const aimedAt = aimedAtInventoryIds.join(',');
  const reaches: QSParams = React.useMemo(
    () =>
      aimedAt
        ? {
            or__ask_inventory_on_launch: 'true',
            or__inventory__isnull: 'true',
            ...(onlyInventory ? { or__inventory: String(onlyInventory) } : {}),
          }
        : {},
    [aimedAt, onlyInventory]
  );

  const {
    result: { templates, count, relatedSearchableKeys, searchableKeys },
    error,
    isLoading,
    request: fetchTemplates,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      /*
       * The api takes a limit only from a template that prompts for one, so a
       * run aimed at particular hosts leaves out whatever would ignore it.
       */
      const acceptsLimit: QSParams = mustAcceptLimit
        ? { ask_limit_on_launch: 'true' }
        : {};
      const [response, options] = await Promise.all([
        api.read({
          ...params,
          ...acceptsLimit,
          ...reaches,
          role_level: 'execute_role',
        }),
        api.readOptions(),
      ]);
      return {
        templates: response.data.results as AnyUnifiedJobTemplate[],
        count: response.data.count,
        relatedSearchableKeys: (options?.data?.related_search_fields || []).map(
          (val) => val.slice(0, -8)
        ),
        searchableKeys: getSearchableKeys(options.data.actions?.GET),
      };
    }, [location, mustAcceptLimit, api, reaches]),
    {
      templates: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  React.useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  /*
   * An empty list here is nearly always a rule rather than an empty
   * installation, so it says which rule: what the reader searched for, the
   * limit a run aimed at hosts needs, or the inventory a template has to be
   * able to reach. The generic message asks for templates to be added, which
   * is advice for an empty Templates page and not for a filtered list.
   */
  const params = parseQueryString(QS_CONFIG, location.search);
  const isSearching = Object.keys(params).some(
    (key) => !QS_CONFIG.defaultParams[key]
  );
  const aimedAtOne = Boolean(aimedAt);
  /* Where the run is aimed already, which is what leaves templates out. A
     wizard that asks for the template first leaves nothing out, and says so
     on the step that does the leaving out instead. */
  const isNarrowed = mustAcceptLimit || aimedAtOne;
  let emptyMessage = t`There are no templates this account may start`;
  if (isSearching) {
    emptyMessage = t`Nothing matches that search`;
  } else if (mustAcceptLimit && aimedAtOne) {
    emptyMessage = t`No template prompts for a limit in this inventory`;
  } else if (aimedAtOne) {
    emptyMessage = t`No template can run in this inventory`;
  }

  return (
    <PaginatedTable
      contentError={error}
      hasContentLoading={isLoading}
      itemCount={count}
      items={templates}
      qsConfig={QS_CONFIG}
      pluralizedItemName={t`Templates`}
      emptyContentMessage={emptyMessage}
      headerRow={
        <HeaderRow isExpandable={false} qsConfig={QS_CONFIG}>
          <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
          <HeaderCell>{t`Inventory`}</HeaderCell>
        </HeaderRow>
      }
      renderRow={(item: AnyUnifiedJobTemplate, index: number) => (
        <CheckboxListItem
          rowIndex={index}
          isSelected={template?.id === item.id}
          itemId={item.id}
          key={`${item.id}-listItem`}
          name={item.name ?? ''}
          label={item.name ?? ''}
          columns={[
            { name: t`Name`, key: 'name' },
            { name: t`Inventory`, key: 'inventoryName' },
          ]}
          item={{ ...item, inventoryName: fixedInventory(item) }}
          onSelect={() => onSelect(item)}
          onDeselect={() => onSelect(null)}
          isRadio
        />
      )}
      renderToolbar={(props) => (
        <DataListToolbar
          {...props}
          fillWidth
          /*
           * What the list holds depends on what the run is aimed at, and a
           * template that is missing is one somebody will search for, so the
           * rule sits beside the search rather than only where it bites.
           */
          additionalControls={
            isNarrowed
              ? [
                  <Popover
                    key="limit-help"
                    id="run-template-limit-help"
                    ouiaId="run-template-limit-help"
                    ariaLabel={t`Which templates are listed`}
                    header={t`Which templates are listed`}
                    content={t`A run aimed at hosts or groups is limited to them, which only a template whose Limit field has Prompt on launch ticked can take. A template stuck with another inventory is left out whatever the run is aimed at, since the inventory it runs in is its own.`}
                  />,
                ]
              : []
          }
        />
      )}
      showPageSizeOptions={false}
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
      ]}
      toolbarSearchableKeys={searchableKeys}
      toolbarRelatedSearchableKeys={relatedSearchableKeys}
    />
  );
}

export default RunTemplateStep;
