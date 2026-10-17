import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal/AlertModal';
import ErrorDetail from 'components/ErrorDetail/ErrorDetail';
import { InventoriesAPI } from 'api';
import Tooltip from 'components/Tooltip';

export interface InventorySyncAllButtonProps {
  inventoryId: number | string;
  /**
   * What the button says it does and what a failure says, for a regular
   * inventory's details, where one click syncs every source it holds.
   */
  tooltip?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

/**
 * Syncs every source an inventory holds in one call: the one source of a
 * constructed inventory, or all of a regular one's. Shared by both details
 * screens, which is why it is named for what it does rather than for the
 * constructed inventory it was first written for.
 */
function InventorySyncAllButton({
  inventoryId,
  tooltip,
  errorMessage,
}: InventorySyncAllButtonProps) {
  const { t } = useLingui();
  /* The name a screen reader hears is what the tooltip says, so the two
     never disagree about what the click does. */
  const description = tooltip ?? t`Sync Inventory`;
  const testId = `inventory-${inventoryId}-sync-all`;
  const {
    isLoading: startSyncLoading,
    error: startSyncError,
    request: startSyncProcess,
  } = useRequest(
    useCallback(
      async () => InventoriesAPI.syncAllSources(inventoryId),
      [inventoryId]
    ),
    undefined
  );

  const { error: startError, dismissError: dismissStartError } =
    useDismissableError(startSyncError);

  return (
    <>
      <Tooltip content={description} position="top">
        <Button
          ouiaId={testId}
          isDisabled={startSyncLoading}
          aria-label={description}
          variant="secondary"
          onClick={startSyncProcess}
        >
          {t`Sync`}
        </Button>
      </Tooltip>
      {startError && (
        <AlertModal
          isOpen={startError}
          variant="error"
          title={t`Error!`}
          onClose={dismissStartError}
        >
          {errorMessage ?? t`Failed to sync constructed inventory source`}
          <ErrorDetail error={startError} />
        </AlertModal>
      )}
    </>
  );
}

export default InventorySyncAllButton;
