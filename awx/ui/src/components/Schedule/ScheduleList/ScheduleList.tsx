import type { Schedule, Untyped } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { SchedulesAPI } from 'api';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { getQSConfig, parseQueryString } from 'util/qs';
import AlertModal from '../../AlertModal';
import ErrorDetail from '../../ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from '../../PaginatedTable';
import DataListToolbar from '../../DataListToolbar';
import ScheduleListItem from './ScheduleListItem';
import type { QSParams } from 'util/qs';
import type { LaunchConfig, SurveyConfig, SurveyQuestion } from 'components/LaunchPrompt/types';

const QS_CONFIG = getQSConfig('schedule', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

export interface ScheduleListProps {
  /** Reads the schedules of whichever resource this list belongs to. */
  loadSchedules: (params: QSParams) => Promise<Untyped>;
  loadScheduleOptions: () => Promise<Untyped>;
  hideAddButton?: boolean;
  resource: Untyped;
  launchConfig: LaunchConfig;
  surveyConfig: SurveyConfig;
  [key: string]: unknown;
}

function ScheduleList({
  loadSchedules,
  loadScheduleOptions,
  hideAddButton = false,
  resource,
  launchConfig,
  surveyConfig,
}: ScheduleListProps) {
  const { t } = useLingui();
  const location = useLocation();

  const {
    result: {
      schedules,
      itemCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading,
    request: fetchSchedules,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        {
          data: { count, results },
        },
        scheduleActions,
      ] = await Promise.all([loadSchedules(params), loadScheduleOptions()]);
      return {
        schedules: results as Schedule[],
        itemCount: count,
        actions: scheduleActions.data.actions,
        relatedSearchableKeys: (
          scheduleActions?.data?.related_search_fields || []
        ).map((val: Untyped) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(scheduleActions.data.actions?.GET),
      };
    }, [location.search, loadSchedules, loadScheduleOptions]),
    {
      schedules: [],
      itemCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(schedules);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteJobs,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      async () =>
        Promise.all(selected.map(({ id }) => SchedulesAPI.destroy(id))),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchSchedules,
    }
  );

  const handleDelete = async () => {
    await deleteJobs();
    clearSelected();
  };

  const canAdd =
    actions &&
    Object.prototype.hasOwnProperty.call(actions, 'POST') &&
    !hideAddButton;
  const isTemplate =
    resource?.type === 'workflow_job_template' ||
    resource?.type === 'job_template';

  const missingRequiredInventory = (schedule: Untyped) => {
    if (
      !launchConfig.inventory_needed_to_start ||
      schedule?.summary_fields?.inventory?.id
    ) {
      return null;
    }
    return t`This schedule is missing an Inventory`;
  };

  const hasMissingSurveyValue = (schedule: Untyped) => {
    let missingValues;
    if (launchConfig.survey_enabled) {
      surveyConfig.spec?.forEach((question: SurveyQuestion) => {
        const hasDefaultValue = Boolean(question.default);
        if (question.required && !hasDefaultValue) {
          const extraData = (schedule?.extra_data ?? {}) as Record<
            string,
            unknown
          >;
          const extraDataKeys = Object.keys(extraData);

          const hasMatchingKey = extraDataKeys.includes(question.variable);
          Object.values(extraData).forEach((value) => {
            if (!value || !hasMatchingKey) {
              missingValues = true;
            } else {
              missingValues = false;
            }
          });
          if (!Object.values(schedule.extra_data).length) {
            missingValues = true;
          }
        }
      });
    }
    return missingValues && t`This schedule is missing required survey values`;
  };
  let emptyContentMessage = t`Please add a Schedule to populate this list.`;

  if (location.pathname.startsWith('/schedules')) {
    emptyContentMessage = t`Please add a Schedule to populate this list.  Schedules can be added to a Template, Project, or Inventory Source.`;
  }

  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || isDeleteLoading}
        items={schedules}
        itemCount={itemCount}
        qsConfig={QS_CONFIG}
        pluralizedItemName={t`Schedules`}
        emptyContentMessage={emptyContentMessage}
        onRowClick={handleSelect}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell sortKey="unified_job_template">
              {t`Related resource`}
            </HeaderCell>
            <HeaderCell sortKey="unified_job_template__polymorphic_ctype__model">
              {t`Resource type`}
            </HeaderCell>
            <HeaderCell sortKey="next_run">{t`Next Run`}</HeaderCell>
            <HeaderCell>{t`Actions`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(item: Schedule, index: number) => (
          <ScheduleListItem
            isSelected={selected.some((row) => row.id === item.id)}
            key={item.id}
            onSelect={() => handleSelect(item)}
            schedule={item}
            rowIndex={index}
            isMissingInventory={Boolean(
              isTemplate && missingRequiredInventory(item)
            )}
            isMissingSurvey={Boolean(
              isTemplate && hasMissingSurveyValue(item)
            )}
          />
        )}
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
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      ouiaId="add-schedule-button"
                      key="add"
                      linkTo={`${location.pathname}/add`}
                    />,
                  ]
                : []),
              <ToolbarDeleteButton
                ouiaId="delete-schedule-button"
                key="delete"
                onDelete={handleDelete}
                itemsToDelete={selected}
                pluralizedItemName={t`Schedules`}
              />,
            ]}
          />
        )}
      />
      {deletionError && (
        <AlertModal
          isOpen={deletionError}
          variant="danger"
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more schedules.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </>
  );
}

export default ScheduleList;
