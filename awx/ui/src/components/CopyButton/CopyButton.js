import React, { useEffect } from 'react';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import PropTypes from 'prop-types';
import { Button } from '@patternfly/react-core';
import { CopyIcon } from '@patternfly/react-icons';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';

function CopyButton({
  id,
  copyItem,
  isDisabled,
  onCopyStart,
  onCopyFinish,
  errorMessage,
  ouiaId,
}) {
  const { i18n } = useLingui();
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
      <Button
        id={id}
        ouiaId={ouiaId}
        isDisabled={isLoading || isDisabled}
        aria-label={i18n._(t`Copy`)}
        variant="plain"
        onClick={copyItemToAPI}
      >
        <CopyIcon />
      </Button>
      {error && (
        <AlertModal
          aria-label={i18n._(t`Copy Error`)}
          isOpen={error}
          variant="error"
          title={i18n._(t`Error!`)}
          onClose={dismissError}
        >
          {errorMessage}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

CopyButton.propTypes = {
  copyItem: PropTypes.func.isRequired,
  onCopyStart: PropTypes.func.isRequired,
  onCopyFinish: PropTypes.func.isRequired,
  errorMessage: PropTypes.string.isRequired,
  isDisabled: PropTypes.bool,
  ouiaId: PropTypes.string,
};

CopyButton.defaultProps = {
  isDisabled: false,
  ouiaId: null,
};

export default CopyButton;
