import React, { useCallback } from 'react';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import PropTypes from 'prop-types';
import { Button, Tooltip } from '@patternfly/react-core';
import { SyncIcon } from '@patternfly/react-icons';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal/AlertModal';
import ErrorDetail from 'components/ErrorDetail/ErrorDetail';
import { InventorySourcesAPI } from 'api';

function InventorySourceSyncButton({ source, icon }) {
  const { i18n } = useLingui();
  const {
    isLoading: startSyncLoading,
    error: startSyncError,
    request: startSyncProcess,
  } = useRequest(
    useCallback(async () => {
      const {
        data: { status },
      } = await InventorySourcesAPI.createSyncStart(source.id);

      return status;
    }, [source.id]),
    {}
  );

  const { error: startError, dismissError: dismissStartError } =
    useDismissableError(startSyncError);

  return (
    <>
      <Tooltip content={i18n._(msg`Start sync process`)} position="top">
        <Button
          ouiaId={`${source}-sync-button`}
          isDisabled={startSyncLoading}
          aria-label={i18n._(msg`Start sync source`)}
          variant={icon ? 'plain' : 'secondary'}
          onClick={startSyncProcess}
        >
          {icon ? <SyncIcon /> : i18n._(msg`Sync`)}
        </Button>
      </Tooltip>

      {startError && (
        <AlertModal
          isOpen={startError}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissStartError}
        >
          {i18n._(msg`Failed to sync inventory source.`)}
          <ErrorDetail error={startError} />
        </AlertModal>
      )}
    </>
  );
}

InventorySourceSyncButton.defaultProps = {
  source: {},
  icon: true,
};

InventorySourceSyncButton.propTypes = {
  source: PropTypes.shape({}),
  icon: PropTypes.bool,
};

export default InventorySourceSyncButton;
