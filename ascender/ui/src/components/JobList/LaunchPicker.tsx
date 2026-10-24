import type { ApiEntity, Paginated } from 'types/api';
import type { QSParams } from 'util/qs';
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Alert } from '@patternfly/react-core';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import Wizard from 'components/Wizard';
import CheckboxListItem from 'components/CheckboxListItem';
import DataListToolbar from 'components/DataListToolbar';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
} from 'components/PaginatedTable';
import { NotStartedDetail } from './notStarted';
import type { NotStarted } from './notStarted';
import './LaunchPicker.css';

/** Its own namespace, so paging this list leaves the runs list where it was. */
const QS_CONFIG = getQSConfig(
  'launch-pick',
  {
    page: 1,
    // What fits the step without scrolling it, and what the wizards beside
    // this one show, so the modals are the same height.
    page_size: 5,
    order_by: 'name',
  },
  ['id', 'page', 'page_size']
);

export interface LaunchPickerProps<T extends ApiEntity> {
  /** What the modal is called, which is what the run will be. */
  title: React.ReactNode;
  /** What the list holds, which is what the one step is called. */
  stepName: React.ReactNode;
  /** Reads a page of what can be started, given the modal's own parameters. */
  read: (params: QSParams) => Promise<{ data: Paginated<T> }>;
  /**
   * Starts the runs the ticked rows stand for. What it answers with is what
   * was refused, by name and with the reason, so the list can say which of
   * them did not start and why; an empty answer is every one of them away.
   */
  onLaunch: (items: T[]) => Promise<NotStarted[] | void>;
  onClose: () => void;
}

/**
 * Pick what to start, and start it.
 *
 * The run menu offers six things to run, and three of them are a list and a
 * launch: a project to update, an inventory source to sync, a cleanup job to
 * run. This is that list, once, rather than three modals that differ only in
 * what they read and what they then call.
 *
 * Ticks rather than one pick, because these are the runs somebody starts
 * several of: the whole set of cleanup jobs, every source of an inventory
 * that has more than one. Several ticked are several runs, and the runs list
 * is where they all are.
 */
function LaunchPicker<T extends ApiEntity>({
  title,
  stepName,
  read,
  onLaunch,
  onClose,
}: LaunchPickerProps<T>) {
  const { t } = useLingui();
  const location = useLocation();
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<unknown>(null);
  /** The ones the api refused, with its reasons, from the last launch. */
  const [refused, setRefused] = useState<NotStarted[]>([]);

  const {
    result: { items, count },
    error,
    isLoading,
    request: fetchItems,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const { data } = await read(params);
      return { items: data.results, count: data.count };
    }, [read, location]),
    { items: [], count: 0 }
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /* Select all is the page on screen, as it is in every other list. */
  const { selected, isAllSelected, handleSelect, selectAll } =
    useSelected<T>(items);

  const handleLaunch = async () => {
    if (!selected.length) {
      return;
    }
    setIsLaunching(true);
    setLaunchError(null);
    setRefused([]);
    try {
      const names = (await onLaunch(selected)) ?? [];
      setRefused(names);
    } catch (err) {
      setLaunchError(err);
    } finally {
      setIsLaunching(false);
    }
  };

  /*
   * One step, and a wizard rather than a plain modal: the run this starts is
   * one of six the menu offers, and the other three open a wizard, so these
   * carry the same header, the same rule under it and the same step beside
   * the list.
   */
  const step = (
    <>
      {/* The modal stays open on a refusal, so the reason is said inside it
          rather than replacing the list with a whole error page. */}
      {Boolean(launchError) && (
        <Alert
          variant="danger"
          isInline
          title={t`Failed to start the run.`}
          className="ascender-launch-picker__error"
        >
          <ErrorDetail error={launchError} />
        </Alert>
      )}
      {/* Some started and some did not, so the ones that did not are named:
          what is on screen otherwise is a list that looks unchanged. */}
      {refused.length > 0 && (
        <Alert
          variant="warning"
          isInline
          ouiaId="launch-picker-refused"
          title={t`Not started: ${refused.map(({ name }) => name).join(', ')}`}
          className="ascender-launch-picker__error"
        >
          <NotStartedDetail refused={refused} />
        </Alert>
      )}
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading || isLaunching}
        itemCount={count}
        items={items}
        qsConfig={QS_CONFIG}
        headerRow={
          <HeaderRow isExpandable={false} qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(item: T, index: number) => (
          <CheckboxListItem
            rowIndex={index}
            isSelected={selected.some((row) => row.id === item.id)}
            itemId={item.id as number}
            key={`${item.id}-listItem`}
            name={String(item.name ?? '')}
            label={String(item.name ?? '')}
            columns={[{ name: t`Name`, key: 'name' }]}
            item={item}
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
          />
        )}
        showPageSizeOptions={false}
        toolbarSearchColumns={[
          { name: t`Name`, key: 'name__icontains', isDefault: true },
        ]}
      />
    </>
  );

  return (
    <Wizard
      isOpen
      title={title}
      onClose={onClose}
      onSave={handleLaunch}
      steps={[
        {
          id: 'pick',
          name: stepName,
          component: step,
          enableNext: selected.length > 0 && !isLaunching,
          nextButtonText: t`Launch`,
        },
      ]}
      backButtonText={t`Back`}
      cancelButtonText={t`Cancel`}
      nextButtonText={t`Launch`}
    />
  );
}

export default LaunchPicker;
