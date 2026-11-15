import type { QSParams } from 'util/qs';
import React, { useCallback, useRef, useState } from 'react';
import { Plural, useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { MinusCircleIcon } from '@patternfly/react-icons';

import useRequest, { useDismissableError } from 'hooks/useRequest';
import { UnifiedJobsAPI } from 'api';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';

export interface StackCancelButtonProps {
  templateId: number;
  templateName?: string;
  count: number;
  params: QSParams;
  style?: React.CSSProperties;
  [key: string]: unknown;
}

/**
 * Cancel every active member of a stack.  The endpoint processes one chunk per
 * call and reports how many jobs remain, so this loops until nothing is left
 * or a chunk stops making progress.  Jobs the user may not cancel are skipped
 * by the backend and reported in the response.
 */
function StackCancelButton({
  templateId,
  templateName,
  count,
  params,
  style = {},
}: StackCancelButtonProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const inFlight = useRef(false);
  const displayName = templateName || t`Template ${templateId}`;

  const cancelStack = useCallback(async () => {
    setIsOpen(false);
    setSkipped(0);

    let beforeId: number | undefined;
    let totalSkipped = 0;
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await UnifiedJobsAPI.cancelStack(
        params,
        templateId,
        beforeId
      );
      totalSkipped += data.skipped;

      const nextBeforeId = data.next_before_id ?? undefined;
      // Skipped jobs are still a successful step: the cursor has moved past
      // them, so a later chunk can reach jobs this user may cancel.  Only stop
      // when the server says there is nothing left, or a cursor stops moving.
      if (data.remaining <= 0 || nextBeforeId === undefined) {
        break;
      }
      if (beforeId !== undefined && nextBeforeId >= beforeId) {
        break;
      }
      beforeId = nextBeforeId;
    }
    setSkipped(totalSkipped);
  }, [params, templateId]);

  const {
    error: cancelError,
    isLoading: isCancelling,
    request: startCancel,
  } = useRequest(cancelStack);
  const { error, dismissError } = useDismissableError(cancelError);

  const handleCancel = useCallback(() => {
    // The disabled button normally blocks a second confirm, but a fast
    // double-click can arrive before React renders the loading state.  The ref
    // keeps one chunk loop per stack row in that window.
    if (inFlight.current) return;
    inFlight.current = true;
    startCancel().finally(() => {
      inFlight.current = false;
    });
  }, [startCancel]);

  return (
    <>
      <Button
        icon={<MinusCircleIcon />}
        aria-label={t`Cancel stack`}
        ouiaId="cancel-stack-button"
        onClick={() => setIsOpen(true)}
        isDisabled={isCancelling}
        variant="plain"
        style={style}
      />
      {isOpen && (
        <AlertModal
          isOpen={isOpen}
          variant="danger"
          onClose={() => setIsOpen(false)}
          title={t`Cancel active jobs?`}
          label={t`Cancel active jobs?`}
          actions={[
            <Button
              id="cancel-stack-confirm-button"
              key="confirm"
              variant="danger"
              aria-label={t`Confirm cancel stack`}
              ouiaId="cancel-stack-confirm-button"
              onClick={handleCancel}
            >
              {t`Cancel ${count} jobs`}
            </Button>,
            <Button
              id="cancel-stack-return-button"
              key="cancel"
              ouiaId="return"
              aria-label={t`Return`}
              variant="secondary"
              onClick={() => setIsOpen(false)}
            >
              {t`Return`}
            </Button>,
          ]}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <Plural
              value={count}
              one="This action will cancel # job of:"
              other="This action will cancel # jobs of:"
            />
          </div>
          <span>
            <strong>{displayName}</strong>
            <br />
          </span>
        </AlertModal>
      )}
      {skipped > 0 && !error && (
        <AlertModal
          isOpen
          variant="warning"
          onClose={() => setSkipped(0)}
          title={t`Some jobs were not canceled`}
          label={t`Some jobs were not canceled`}
        >
          {t`${skipped} jobs could not be canceled because you do not have permission.`}
        </AlertModal>
      )}
      {error && (
        <AlertModal
          isOpen={error}
          variant="danger"
          onClose={dismissError}
          title={t`Job Cancel Error`}
          label={t`Job Cancel Error`}
        >
          {t`Failed to cancel the stack.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default StackCancelButton;
