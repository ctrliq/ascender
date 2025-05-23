import React, { useCallback } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import PropTypes from 'prop-types';
import { Button, Tooltip } from '@patternfly/react-core';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal/AlertModal';
import ErrorDetail from 'components/ErrorDetail/ErrorDetail';
import { InventoriesAPI } from 'api';

function ConstructedInventorySyncButton({ inventoryId }) {
  const { i18n } = useLingui();
  const testId = `constructed-inventory-${inventoryId}-sync`;
  const {
    isLoading: startSyncLoading,
    error: startSyncError,
    request: startSyncProcess,
  } = useRequest(
    useCallback(
      async () => InventoriesAPI.syncAllSources(inventoryId),
      [inventoryId]
    ),
    {}
  );

  const { error: startError, dismissError: dismissStartError } =
    useDismissableError(startSyncError);

  return (
    <>
      <Tooltip content={i18n._(msg`Start sync process`)} position="top">
        <Button
          ouiaId={testId}
          isDisabled={startSyncLoading}
          aria-label={i18n._(msg`Start inventory source sync`)}
          variant="secondary"
          onClick={startSyncProcess}
        >
          {i18n._(msg`Sync`)}
        </Button>
      </Tooltip>
      {startError && (
        <AlertModal
          isOpen={startError}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissStartError}
        >
          {i18n._(msg`Failed to sync constructed inventory source`)}
          <ErrorDetail error={startError} />
        </AlertModal>
      )}
    </>
  );
}

ConstructedInventorySyncButton.propTypes = {
  inventoryId: PropTypes.number.isRequired,
};

export default ConstructedInventorySyncButton;
