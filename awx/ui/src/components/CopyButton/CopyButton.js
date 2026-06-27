import React, { useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CopyIcon } from '@patternfly/react-icons';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';

function CopyButton({
  id,
  copyItem,
  isDisabled = false,
  onCopyStart,
  onCopyFinish,
  errorMessage,
  ouiaId = null,
}) {
  const { t } = useLingui();
  const {
    isLoading,
    error: copyError,
    request: copyItemToAPI,
  } = useRequest(copyItem);

  useEffect(() => {
    if (isLoading) {
      return onCopyStart();
    }
    return onCopyFinish();
  }, [isLoading, onCopyStart, onCopyFinish]);

  const { error, dismissError } = useDismissableError(copyError);

  return (
    <>
      <Button icon={<CopyIcon />}
        id={id}
        ouiaId={ouiaId}
        isDisabled={isLoading || isDisabled}
        aria-label={t`Copy`}
        variant="plain"
        onClick={copyItemToAPI}
       />
      {error && (
        <AlertModal
          aria-label={t`Copy Error`}
          isOpen={error}
          variant="error"
          title={t`Error!`}
          onClose={dismissError}
        >
          {errorMessage}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default CopyButton;
