import type { InventorySource } from 'types/api';
import React, { useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { SyncIcon } from '@patternfly/react-icons';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal/AlertModal';
import ErrorDetail from 'components/ErrorDetail/ErrorDetail';
import { InventorySourcesAPI } from 'api';
import Tooltip from 'components/Tooltip';

export interface InventorySourceSyncButtonProps {
  source?: Partial<InventorySource>;
  /** Renders the icon-only button a list row uses, rather than a labelled one. */
  icon?: boolean;
  /**
   * A labelled button with this text and tooltip, as a runs tab shows it,
   * rather than the look this button takes on its own screen.
   */
  label?: string;
  tooltip?: string;
}

function InventorySourceSyncButton({
  source = {},
  icon = true,
  label,
  tooltip,
}: InventorySourceSyncButtonProps) {
  const { t } = useLingui();
  const {
    isLoading: startSyncLoading,
    error: startSyncError,
    request: startSyncProcess,
  } = useRequest(
    useCallback(async () => {
      const {
        data: { status },
      } = await InventorySourcesAPI.createSyncStart(source.id as number);

      return status;
    }, [source.id]),
    null
  );

  const { error: startError, dismissError: dismissStartError } =
    useDismissableError(startSyncError);

  return (
    <>
      <Tooltip content={tooltip ?? t`Sync Source`} position="top">
        <Button
          ouiaId={`${source.id}-sync-button`}
          isDisabled={startSyncLoading}
          aria-label={label ?? t`Sync Source`}
          variant={icon ? 'plain' : 'secondary'}
          onClick={startSyncProcess}
        >
          {icon ? <SyncIcon /> : (label ?? t`Sync`)}
        </Button>
      </Tooltip>

      {startError && (
        <AlertModal
          isOpen={startError}
          variant="error"
          title={t`Error!`}
          onClose={dismissStartError}
        >
          {t`Failed to sync inventory source.`}
          <ErrorDetail error={startError} />
        </AlertModal>
      )}
    </>
  );
}

export default InventorySourceSyncButton;
