import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button, DropdownItem } from '@patternfly/react-core';
import { useKebabifiedMenu } from 'contexts/Kebabified';
import { settleInBatches } from 'util/batches';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';
import Tooltip from '../Tooltip';

/** How many syncs are asked for at once, where a click starts several. */
export const SYNC_BATCH_SIZE = 5;

/** The least a row needs for this button to name it and start it. */
export interface SyncableItem {
  id: number;
  name?: string | null;
  [key: string]: unknown;
}

export interface ToolbarSyncButtonProps<T extends SyncableItem> {
  /** What is ticked, which is what a click syncs where anything is. */
  itemsToSync: T[];
  /**
   * Whether this reader can sync a row: a project needs a source to pull
   * from, an inventory needs a source to read, and either needs a reader
   * allowed to start it. It filters the whole list as much as what is ticked.
   */
  canSync: (item: T) => boolean;
  /**
   * Whether a row has a source at all, whoever is asking. It is what tells
   * the two reasons a ticked row is left out apart when the reader is told
   * about it: nothing to sync from, or no permission to start it. Without
   * it every row counts as having one, as every inventory source does.
   */
  hasSource?: (item: T) => boolean;
  /**
   * How many rows in the whole list this reader can sync, which is what
   * says whether the button does anything: none on a new installation, none
   * where every project is a manual one, and none where the reader may start
   * none of them.
   */
  syncableCount: number;
  /**
   * How many rows in the whole list have a source, whoever is asking. Where
   * it is above syncableCount the rest are ones the reader may not start,
   * and the tooltip of a disabled button says that rather than blaming the
   * sources. Left out, it is taken to be syncableCount.
   */
  sourcedCount?: number;
  /**
   * Every row this reader may sync, read for a click with nothing ticked.
   * The api is asked for only those, by role where the list has roles.
   */
  readSyncable: () => Promise<T[]>;
  /** Starts the sync of one row. */
  sync: (item: T) => Promise<unknown>;
  /** What the rows are, in the plural, for what this says about them. */
  pluralizedItemName: string;
  /**
   * What a disabled button says where no row has a source. The default
   * blames the sources, which is wrong for a list whose rows always have
   * one, such as inventory sources, or one a search has emptied.
   */
  emptyTooltip?: string;
  /**
   * Whether the list is narrowed by a search. Sync All reads only what the
   * search matches, so with nothing ticked the button says so rather than
   * offering every row there is.
   */
  isSearched?: boolean;
  /**
   * Whether the list is still finding out if its ticked rows may be synced.
   * The button waits, rather than let a click report a row as refused only
   * because the answer about it had not arrived.
   */
  isChecking?: boolean;
}

/**
 * The toolbar button that syncs what a list holds.
 *
 * Ticked rows are what it syncs; ticking nothing means the whole list, which
 * is the usual thing to want of it and the reason it is here rather than one
 * button per row. A sync is one run each, so what it starts is watched on the
 * runs list rather than here.
 */
function ToolbarSyncButton<T extends SyncableItem>({
  itemsToSync,
  canSync,
  hasSource = () => true,
  syncableCount,
  sourcedCount = syncableCount,
  readSyncable,
  sync,
  pluralizedItemName,
  emptyTooltip,
  isSearched = false,
  isChecking = false,
}: ToolbarSyncButtonProps<T>) {
  const { t } = useLingui();
  const { isKebabified } = useKebabifiedMenu();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const ticked = itemsToSync.filter(canSync);
  /* A ticked row is left out for one of two reasons, and the reader is told
     which, counted apart: it has nothing to sync from, or it has a source
     the reader is not allowed to start. */
  const withoutSource = itemsToSync.filter((item) => !hasSource(item)).length;
  const withoutPermission = itemsToSync.filter(
    (item) => hasSource(item) && !canSync(item)
  ).length;
  /* Nothing ticked is the whole list, which is what the tooltip says the
     click will do. */
  const syncsEverything = itemsToSync.length === 0;

  const skippedNotes = () => {
    if (syncsEverything) {
      return [];
    }
    const notes: string[] = [];
    if (withoutSource > 0) {
      notes.push(
        t`${withoutSource} of those selected have no source to sync from.`
      );
    }
    if (withoutPermission > 0) {
      notes.push(
        t`You do not have permission to sync ${withoutPermission} of those selected.`
      );
    }
    return notes;
  };

  const startAll = async (items: T[]) => {
    if (!items.length) {
      /* Where rows were ticked the notes name why none of them started;
         with nothing ticked the whole list had nothing this reader could
         sync. */
      setMessage(
        syncsEverything
          ? [t`Nothing here can be synced.`]
          : [t`None of those selected can be synced.`, ...skippedNotes()]
      );
      return;
    }
    /* A few at a time rather than all at once: Sync All on a long list is
       hundreds of launches, and each one is a job the api has to create. */
    const answers = await settleInBatches(items, SYNC_BATCH_SIZE, (item) =>
      sync(item)
    );
    const refused = items
      .filter((_, index) => answers[index]?.status === 'rejected')
      .map((item) => String(item.name ?? ''));
    /* What was left out is said even when every sync that was started went
       through, since otherwise the reader has no way to know a ticked row
       was never started. */
    const lines = [
      ...(refused.length ? [t`Not started: ${refused.join(', ')}`] : []),
      ...skippedNotes(),
    ];
    if (lines.length) {
      if (refused.length < items.length) {
        lines.unshift(t`Syncs started: ${items.length - refused.length}`);
      }
      setMessage(lines);
    }
  };

  const handleClick = async () => {
    setIsSyncing(true);
    try {
      /* The whole list comes from the api rather than from the page in
         front of the reader, which holds only what fits on it, and already
         narrowed by the api to what the reader may start. It is not run
         through canSync again, since a permission such as an inventory's
         update role is only known for the rows on the page. */
      await startAll(
        syncsEverything ? (await readSyncable()).filter(hasSource) : ticked
      );
    } catch (err) {
      setError(err);
    } finally {
      setIsSyncing(false);
    }
  };

  /* Says which of the two a click is: the whole list, or what is ticked. */
  const label = syncsEverything ? t`Sync All` : t`Sync`;
  const waitsForCheck = isChecking && !syncsEverything;
  const isDisabled = syncableCount === 0 || isSyncing || waitsForCheck;
  const tooltip = (() => {
    if (waitsForCheck) {
      return t`Checking which of the selected may be synced`;
    }
    /* Off for one of two reasons, and the tooltip names the right one:
       there are sources here, but none this reader may start. */
    if (syncableCount === 0 && sourcedCount > 0) {
      return t`You do not have permission to sync any of these.`;
    }
    if (syncableCount === 0) {
      return emptyTooltip ?? t`Nothing here has a source to sync from.`;
    }
    // Named for the list, "Sync all Projects", since nothing ticked is all.
    if (syncsEverything) {
      return isSearched
        ? t`Sync all ${pluralizedItemName} matching the current search`
        : t`Sync all ${pluralizedItemName}`;
    }
    return t`Sync Selected`;
  })();

  return (
    <>
      {isKebabified ? (
        <DropdownItem
          key="sync"
          component="button"
          isDisabled={isDisabled}
          ouiaId="toolbar-sync-dropdown-item"
          onClick={handleClick}
        >
          {label}
        </DropdownItem>
      ) : (
        <Tooltip content={tooltip} position="top">
          <div>
            <Button
              ouiaId="toolbar-sync-button"
              variant="secondary"
              aria-label={label}
              isDisabled={isDisabled}
              onClick={handleClick}
            >
              {label}
            </Button>
          </div>
        </Tooltip>
      )}

      {message && (
        <AlertModal
          isOpen
          variant="info"
          title={t`Sync ${pluralizedItemName}`}
          onClose={() => setMessage(null)}
        >
          {message.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </AlertModal>
      )}

      {Boolean(error) && (
        <AlertModal
          isOpen
          variant="error"
          title={t`Error!`}
          onClose={() => setError(null)}
        >
          {t`Failed to start the sync.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default ToolbarSyncButton;
