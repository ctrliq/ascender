import type { ApiEntity, Paginated } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Alert } from '@patternfly/react-core';
import { UnifiedJobTemplatesAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import CheckboxListItem from 'components/CheckboxListItem';
import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
} from 'components/PaginatedTable';

/**
 * Its own namespace, so paging this list leaves the schedules behind it where
 * they were: both read the query string, and both would answer to `page`.
 */
export const QS_CONFIG = getQSConfig(
  'schedule-for',
  {
    page: 1,
    // What fits the step without scrolling it, as the other pickers show.
    page_size: 5,
    order_by: 'name',
  },
  ['id', 'page', 'page_size']
);

/**
 * Whether the account may put this resource on a schedule at all.
 *
 * A refusal is the api saying so: a manual project answers false, since it has
 * nothing to run on a schedule, and so does a resource the account may only
 * read. Silence is not a refusal, and the cleanup jobs are silent: the api
 * reports no such capability for them, while their own screen schedules them
 * like anything else.
 */
export const canSchedule = (resource: ApiEntity) =>
  (
    resource.summary_fields as
      { user_capabilities?: { schedule?: boolean } } | undefined
  )?.user_capabilities?.schedule !== false;

export interface ScheduleResourcePickerProps {
  /** What is picked, which the step after this one is built for. */
  picked: ApiEntity | null;
  onPick: (resource: ApiEntity | null) => void;
}

/** What a schedule is for, as one list of everything it can be hung on. */
function ScheduleResourcePicker({
  picked,
  onPick,
}: ScheduleResourcePickerProps) {
  const { t } = useLingui();
  const location = useLocation();
  const kindLabels: Record<string, string> = {
    job_template: t`Job Template`,
    workflow_job_template: t`Workflow Template`,
    project: t`Project`,
    inventory_source: t`Inventory Source`,
    system_job_template: t`Cleanup Job`,
  };

  const {
    result: { items, count },
    error,
    isLoading,
    request: fetchItems,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const { data } =
        await UnifiedJobTemplatesAPI.read<Paginated<ApiEntity>>(params);
      return { items: data.results, count: data.count };
    }, [location]),
    { items: [], count: 0 }
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /*
   * A manual project has nothing to run on a schedule, and a resource the
   * account may only read has nothing to add to it: both come back in the
   * list, since the api has no filter for either, so the row is picked and
   * the reason is given rather than the row being silently missing.
   */
  const refusal = Boolean(picked) && !canSchedule(picked as ApiEntity);

  return (
    <>
      {refusal && (
        <Alert
          variant="warning"
          isInline
          ouiaId="schedule-for-refused"
          className="ascender-add-schedule__alert"
          title={t`${String(picked?.name ?? '')} cannot be scheduled: it either has nothing to run on a schedule, or this account may not add one.`}
        />
      )}
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading}
        itemCount={count}
        items={items}
        qsConfig={QS_CONFIG}
        pluralizedItemName={t`Resources`}
        headerRow={
          <HeaderRow isExpandable={false} qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell>{t`Type`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(item: ApiEntity, index: number) => (
          <CheckboxListItem
            rowIndex={index}
            isSelected={picked?.id === item.id}
            itemId={item.id as number}
            key={`${item.id}-listItem`}
            name={String(item.name ?? '')}
            label={String(item.name ?? '')}
            columns={[
              { name: t`Name`, key: 'name' },
              { name: t`Type`, key: 'kindLabel' },
            ]}
            item={{
              ...item,
              kindLabel: kindLabels[String(item.type)] ?? String(item.type),
            }}
            onSelect={() => onPick(item)}
            onDeselect={() => onPick(null)}
            isRadio
          />
        )}
        renderToolbar={(props) => (
          <DataListToolbar {...props} fillWidth qsConfig={QS_CONFIG} />
        )}
        showPageSizeOptions={false}
        toolbarSearchColumns={[
          { name: t`Name`, key: 'name__icontains', isDefault: true },
        ]}
      />
    </>
  );
}

export default ScheduleResourcePicker;
