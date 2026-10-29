import React from 'react';
import { Navigate, Route } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import JobList from 'components/JobList';
import InventoryRunMenu from 'components/JobList/InventoryRunMenu';
import type { QSParams } from 'util/qs';

/** How one kind of inventory's runs differ from another's. */
export interface InventoryRunsOptions {
  /**
   * Whether the inventory has sources whose updates count among its runs.
   * A federated inventory has none, so its runs leave them out.
   */
  includeSourceUpdates?: boolean;
  /** Whether the runs list may also be searched by the updated source. */
  searchBySource?: boolean;
}

/**
 * The query that lists every run against one inventory.
 *
 * Args:
 *   inventoryId: The inventory whose runs are listed.
 *   options: Whether source updates count among them.
 *
 * Returns:
 *   The default params for the runs list: jobs, ad hoc commands and workflow
 *   jobs on the inventory, and the updates of its sources where it has any.
 */
export function getInventoryRunsParams(
  inventoryId: number,
  { includeSourceUpdates = true }: InventoryRunsOptions = {}
): QSParams {
  return {
    or__job__inventory: inventoryId,
    or__adhoccommand__inventory: inventoryId,
    ...(includeSourceUpdates
      ? { or__inventoryupdate__inventory_source__inventory: inventoryId }
      : {}),
    or__workflowjob__inventory: inventoryId,
  };
}

export interface InventoryRunsProps extends InventoryRunsOptions {
  inventoryId: number;
}

/**
 * An inventory's Runs tab: every run against it, with the hosts list's Run
 * menu aimed at this inventory in place of the general one.
 */
export function InventoryRuns({
  inventoryId,
  includeSourceUpdates = true,
  searchBySource = false,
}: InventoryRunsProps) {
  const { t } = useLingui();
  return (
    <JobList
      defaultParams={getInventoryRunsParams(inventoryId, {
        includeSourceUpdates,
      })}
      additionalRelatedSearchableKeys={
        searchBySource ? ['inventoryupdate__inventory_source__inventory'] : []
      }
      runControl={
        <InventoryRunMenu
          inventoryId={inventoryId}
          tooltip={t`Run on Inventory`}
        />
      }
    />
  );
}

/**
 * The routes every inventory screen gives its runs, to sit inside its
 * <Routes>: the Runs tab itself, and the tab's old address sent on to it.
 *
 * Called rather than drawn as a component, since <Routes> reads its <Route>
 * children directly and would not look inside a component for them.
 *
 * Args:
 *   inventory: The inventory on screen, or null while it is still read, in
 *     which case only the redirect is there.
 *   options: How this kind of inventory's runs differ.
 *
 * Returns:
 *   The routes, as one fragment.
 */
export function inventoryRunsRoutes(
  inventory: { id: number } | null,
  options: InventoryRunsOptions = {}
) {
  return (
    <>
      {/* The tab's address before the rail called these runs. */}
      <Route path="jobs" element={<Navigate to="../runs" replace />} />
      {inventory && (
        <Route
          path="runs"
          element={<InventoryRuns inventoryId={inventory.id} {...options} />}
        />
      )}
    </>
  );
}
