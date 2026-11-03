import type { ApiEntity, Paginated } from 'types/api';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  Alert,
  FormSelect,
  FormSelectOption,
  Split,
  SplitItem,
} from '@patternfly/react-core';
import type { QSParams } from 'util/qs';
import { getQSConfig, parseQueryString } from 'util/qs';
import { GroupsAPI, HostsAPI, InventoriesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import CheckboxListItem from 'components/CheckboxListItem';
import DataListToolbar from 'components/DataListToolbar';
import Popover from 'components/Popover';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
} from 'components/PaginatedTable';
import './RunTargetStep.css';
import toHostPattern from 'util/hostPattern';

/** What a run can be aimed at, in the order the dropdown offers them. */
export type TargetKind = 'inventory' | 'group' | 'host';

/** What the reader chose: the inventories to run in, and what to run on. */
export interface RunTarget {
  kind: TargetKind;
  /** One per run: several inventories are several runs of the same thing. */
  inventoryIds: number[];
  /** The hosts or groups ticked, as the pattern a run is limited to. */
  limit?: string;
  /** The rows ticked, which is what the step opens on when it comes back. */
  items: ApiEntity[];
  /** What was ticked, in a line, for the preview of the run to repeat. */
  summary: string;
  /** Those inventories by name, for a preview that says where a run lands. */
  inventoryNames: string[];
}

/** Its own namespace, so paging this list leaves the runs behind it alone. */
const QS_CONFIG = getQSConfig(
  'run-target',
  {
    page: 1,
    // What fits the step without scrolling it.
    page_size: 5,
    order_by: 'name',
  },
  ['id', 'page', 'page_size']
);

/** The inventory a host or a group belongs to, as its summary reports it. */
const inventoryOf = (item?: ApiEntity) =>
  (item?.summary_fields as { inventory?: { id?: number; name?: string } })
    ?.inventory;

export interface RunTargetStepProps {
  /**
   * The answer so far, which the step opens on. The wizard rebuilds its steps
   * when a template is picked, so what was ticked has to come back with it.
   */
  value?: RunTarget | null;
  /**
   * What the run may be aimed at, in the order offered. A template decides
   * this: an inventory only where it prompts for one, hosts and groups only
   * where it prompts for a limit. Everything, where nothing has said.
   */
  kinds?: TargetKind[];
  /**
   * The inventory the run is stuck in, where the template names its own: the
   * hosts and groups offered are that inventory's, since a limit naming any
   * others would rule out every host the run has.
   */
  withinInventoryId?: number | null;
  /**
   * The role an inventory has to grant for this kind of run: a command asks
   * for the ad hoc role, a template for the use role.
   */
  inventoryRole?: string;
  /**
   * What is ticked, as often as it changes, and null while it is nothing a
   * run can be aimed at. The wizard reads it for the step after this one and
   * for whether there is one to go to.
   */
  onChange: (target: RunTarget | null) => void;
  /**
   * Whether what is ticked could be run at all, which is a different question
   * from whether it is anything: nothing ticked is a run on the whole
   * inventory, while hosts from two inventories is not a run.
   */
  onValidity?: (isValid: boolean) => void;
}

/**
 * What to run on, the first step of a run started from the runs list.
 *
 * A run is aimed at an inventory, and often at part of one: the hosts or the
 * groups ticked here become the pattern it is limited to. Several inventories
 * are several runs of the same thing, one in each.
 */
function RunTargetStep({
  value,
  inventoryRole = 'use_role',
  kinds,
  withinInventoryId,
  onChange,
  onValidity,
}: RunTargetStepProps) {
  const { t } = useLingui();
  const location = useLocation();
  const labels: Record<TargetKind, string> = {
    inventory: t`Inventory`,
    group: t`Groups`,
    host: t`Hosts`,
  };
  const offered = kinds?.length
    ? kinds
    : (['inventory', 'group', 'host'] as TargetKind[]);
  const [kind, setKind] = useState<TargetKind>(
    value?.kind && offered.includes(value.kind)
      ? value.kind
      : (offered[0] as TargetKind)
  );

  const {
    result: { items, count },
    error,
    isLoading,
    request: fetchItems,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      /* Where the template names its own inventory, its hosts and groups are
         the only ones a limit can name. */
      const within: QSParams = withinInventoryId
        ? { inventory: withinInventoryId }
        : {};
      const read = {
        inventory: () =>
          InventoriesAPI.read<Paginated<ApiEntity>>({
            ...params,
            role_level: inventoryRole,
          }),
        group: () =>
          GroupsAPI.read<Paginated<ApiEntity>>({ ...params, ...within }),
        host: () =>
          HostsAPI.read<Paginated<ApiEntity>>({ ...params, ...within }),
      }[kind];
      const { data } = await read();
      return { items: data.results, count: data.count };
    }, [kind, inventoryRole, withinInventoryId, location]),
    { items: [], count: 0 }
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /*
   * What starts ticked is the answer the step is opening again on, which is
   * how it survives the wizard being rebuilt around a template's prompts.
   */
  const { selected, handleSelect, setSelected, clearSelected } =
    useSelected<ApiEntity>(items, value?.items ?? []);

  /*
   * Ticks here outlive a page turn, so a run can be aimed at hosts from more
   * than one page. Select all is the page on screen, then: the box is ticked
   * where every row on this page is, whatever else is ticked elsewhere, and
   * it adds this page's rows or takes them away, leaving the other pages'
   * ticks as they were.
   */
  const isTicked = (item: ApiEntity) =>
    selected.some((row) => row.id === item.id);
  const isAllSelected = items.length > 0 && items.every(isTicked);
  const selectAll = (isSelected: boolean) => {
    const onPage = new Set(items.map((item) => item.id));
    const elsewhere = selected.filter((row) => !onPage.has(row.id));
    setSelected(isSelected ? [...elsewhere, ...items] : elsewhere);
  };

  /*
   * A run happens in one inventory, so hosts and groups ticked across two of
   * them cannot be one run: the reader is told rather than left with a Next
   * that does nothing.
   */
  const inventories = useMemo(() => {
    if (kind === 'inventory') {
      return selected.map((item) => item.id as number);
    }
    return [
      ...new Set(
        selected
          .map((item) => inventoryOf(item)?.id)
          .filter((id): id is number => typeof id === 'number')
      ),
    ];
  }, [kind, selected]);

  /* The same inventories by name, which is what a preview can show. */
  const inventoryNames = useMemo(
    () => [
      ...new Set(
        selected
          .map((item) =>
            kind === 'inventory'
              ? String(item.name ?? '')
              : (inventoryOf(item)?.name ?? '')
          )
          .filter(Boolean)
      ),
    ],
    [kind, selected]
  );

  /*
   * Why the list holds what it holds, which is a rule of the template's and
   * not of this step: shown only where a template narrowed it, since without
   * one there is nothing to explain.
   */
  const rule = (() => {
    if (!kinds?.length) {
      return '';
    }
    if (!offered.includes('inventory')) {
      return t`This template runs in its own inventory, so these are its hosts and groups. Ticking nothing runs it on all of them.`;
    }
    if (offered.length === 1) {
      return t`This template prompts for an inventory, so a run is aimed at whole ones. Several are several runs, one in each.`;
    }
    return t`This template prompts for an inventory and for a limit, so a run is aimed at whole inventories or at what is inside one.`;
  })();

  const spansInventories = kind !== 'inventory' && inventories.length > 1;
  const isAnswered = selected.length > 0 && !spansInventories;

  /*
   * The line the preview repeats: the inventories a run covers whole, or the
   * hosts and groups it is limited to and the one inventory they are in.
   */
  const describe = () => {
    const names = selected.map((item) => String(item.name ?? '')).join(', ');
    if (kind === 'inventory') {
      return names;
    }
    const inventory = inventoryOf(selected[0])?.name ?? '';
    return t`${names} in ${inventory}`;
  };

  /*
   * An inventory is where the run happens rather than a pattern inside it, so
   * ticking whole ones leaves no limit at all: what a form makes of that is
   * every host.
   */
  useEffect(() => {
    onChange(
      isAnswered
        ? {
            kind,
            inventoryIds: inventories,
            limit:
              kind === 'inventory'
                ? undefined
                : toHostPattern(selected.map((item) => item.name)),
            items: selected,
            summary: describe(),
            inventoryNames,
          }
        : null
    );
    onValidity?.(!spansInventories);
    // The answer is what was ticked, and onChange is the wizard's own setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kind,
    selected,
    inventories,
    inventoryNames,
    isAnswered,
    spansInventories,
  ]);

  return (
    <>
      <Split hasGutter className="ascender-run-target__kind">
        <SplitItem>{t`Run On`}</SplitItem>
        <SplitItem>
          {/* One kind is not a choice: the template left one way to aim a run
              and the step says which rather than offering a list of one. */}
          {offered.length === 1 ? (
            <b>{labels[kind]}</b>
          ) : (
            <FormSelect
              value={kind}
              aria-label={t`Run On`}
              ouiaId="run-target-kind"
              onChange={(_event, value) => {
                clearSelected();
                setKind(value as TargetKind);
              }}
            >
              {offered.map((option) => (
                <FormSelectOption
                  key={option}
                  value={option}
                  label={labels[option]}
                />
              ))}
            </FormSelect>
          )}
        </SplitItem>
      </Split>

      {spansInventories && (
        <Alert
          variant="warning"
          isInline
          className="ascender-run-target__error"
          title={t`One run happens in one inventory. What is ticked is in ${inventories.length} of them.`}
        />
      )}

      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading}
        itemCount={count}
        items={items}
        qsConfig={QS_CONFIG}
        /*
         * No clearSelected: paging is how a run on hosts from two pages is
         * built, so what is ticked outlives the page it was ticked on. The
         * kind dropdown clears it, being a different list altogether.
         */
        headerRow={
          <HeaderRow isExpandable={false} qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            {kind === 'inventory' ? null : (
              <HeaderCell>{t`Inventory`}</HeaderCell>
            )}
          </HeaderRow>
        }
        renderRow={(item: ApiEntity, index: number) => (
          <CheckboxListItem
            rowIndex={index}
            isSelected={isTicked(item)}
            itemId={item.id as number}
            key={`${item.id}-listItem`}
            name={String(item.name ?? '')}
            label={String(item.name ?? '')}
            columns={
              kind === 'inventory'
                ? [{ name: t`Name`, key: 'name' }]
                : [
                    { name: t`Name`, key: 'name' },
                    { name: t`Inventory`, key: 'inventoryName' },
                  ]
            }
            item={{ ...item, inventoryName: inventoryOf(item)?.name ?? '' }}
            onSelect={() => handleSelect(item)}
            onDeselect={() => handleSelect(item)}
          />
        )}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            fillWidth
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={
              rule
                ? [
                    <Popover
                      key="target-help"
                      id="run-target-help"
                      ouiaId="run-target-help"
                      ariaLabel={t`What can be ticked`}
                      header={t`What can be ticked`}
                      content={rule}
                    />,
                  ]
                : []
            }
          />
        )}
        showPageSizeOptions={false}
        toolbarSearchColumns={[
          { name: t`Name`, key: 'name__icontains', isDefault: true },
        ]}
      />
    </>
  );
}

export default RunTargetStep;
