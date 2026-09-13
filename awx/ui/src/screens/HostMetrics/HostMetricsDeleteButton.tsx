import type { HostMetric } from 'types/api';
import type {
  DeleteCount,
  DeleteRequest,
} from 'util/getRelatedResourceDeleteDetails';
import React, { useState } from 'react';
import styled from 'styled-components';
import { Alert, Badge, Button, Tooltip } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { getRelatedResourceDeleteCounts } from 'util/getRelatedResourceDeleteDetails';
import AlertModal from '../../components/AlertModal';

import ErrorDetail from '../../components/ErrorDetail';

const WarningMessage = styled(Alert)`
  margin-top: 10px;
`;

const Label = styled.span`
  && {
    margin-right: 10px;
  }
`;

export interface HostMetricsDeleteButtonProps {
  itemsToDelete: HostMetric[];
  pluralizedItemName?: React.ReactNode;
  onDelete: () => void;
  /** What to count before the delete is allowed, where a row has related rows. */
  deleteDetailsRequests?: DeleteRequest[];
  warningMessage?: React.ReactNode;
  deleteMessage?: React.ReactNode;
  [key: string]: unknown;
}

function HostMetricsDeleteButton({
  itemsToDelete,
  pluralizedItemName = null,
  onDelete,
  deleteDetailsRequests,
  warningMessage = null,
  deleteMessage,
}: HostMetricsDeleteButtonProps) {
  const { t, i18n } = useLingui();
  if (!pluralizedItemName) {
    pluralizedItemName = t`Items`;
  }
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [deleteDetails, setDeleteDetails] = useState<DeleteCount[] | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  const [deleteMessageError, setDeleteMessageError] = useState<unknown>();
  const handleDelete = () => {
    onDelete();
    toggleModal(false);
  };

  const toggleModal = async (isOpen: boolean) => {
    setIsLoading(true);
    setDeleteDetails(null);
    if (
      isOpen &&
      itemsToDelete.length === 1 &&
      (deleteDetailsRequests?.length ?? 0) > 0
    ) {
      const { results, error } = await getRelatedResourceDeleteCounts(
        deleteDetailsRequests ?? []
      );

      if (error) {
        setDeleteMessageError(error);
      } else {
        setDeleteDetails(results || null);
      }
    }
    setIsLoading(false);
    setIsModalOpen(isOpen);
  };

  const renderTooltip = () => {
    if (itemsToDelete.length) {
      return t`Soft delete`;
    }
    return t`Select a row to delete`;
  };

  const modalTitle = t`Soft delete ${pluralizedItemName}?`;

  const isDisabled = itemsToDelete.length === 0;

  const buildDeleteWarning = () => {
    const deleteMessages = [];
    if (warningMessage) {
      deleteMessages.push(warningMessage);
    }
    if (deleteMessage) {
      if (itemsToDelete.length > 1 || deleteDetails) {
        deleteMessages.push(deleteMessage);
      }
    }
    return (
      <div>
        {deleteMessages.map((message) => (
          <div aria-label={String(message)} key={String(message)}>
            {message}
          </div>
        ))}
        {deleteDetails &&
          deleteDetails.map(({ label, count }) => (
            <div key={label.id} aria-label={`${i18n._(label)}: ${count}`}>
              <Label>{i18n._(label)}</Label>
              <Badge>{count}</Badge>
            </div>
          ))}
      </div>
    );
  };

  if (deleteMessageError) {
    return (
      <AlertModal
        isOpen={deleteMessageError}
        title={t`Error!`}
        onClose={() => {
          toggleModal(false);
          setDeleteMessageError(undefined);
        }}
      >
        <ErrorDetail error={deleteMessageError} />
      </AlertModal>
    );
  }
  const shouldShowDeleteWarning =
    warningMessage ||
    (itemsToDelete.length === 1 && deleteDetails) ||
    (itemsToDelete.length > 1 && deleteMessage);

  return (
    <>
      <Tooltip content={renderTooltip()} position="top">
        <div>
          <Button
            variant="secondary"
            isLoading={isLoading}
            ouiaId="delete-button"
            spinnerAriaValueText={isLoading ? 'Loading' : undefined}
            aria-label={t`Delete`}
            onClick={() => toggleModal(true)}
            isDisabled={isDisabled}
          >
            {t`Delete`}
          </Button>
        </div>
      </Tooltip>
      {isModalOpen && (
        <AlertModal
          variant="danger"
          title={modalTitle}
          isOpen={isModalOpen}
          onClose={() => toggleModal(false)}
          actions={[
            <Button
              ouiaId="delete-modal-confirm"
              key="delete"
              variant="danger"
              aria-label={t`confirm delete`}
              isDisabled={Boolean(
                deleteDetails &&
                (itemsToDelete[0] as { type?: string })?.type ===
                  'credential_type'
              )}
              onClick={handleDelete}
            >
              {t`Delete`}
            </Button>,
            <Button
              ouiaId="delete-cancel"
              key="cancel"
              variant="link"
              aria-label={t`cancel delete`}
              onClick={() => toggleModal(false)}
            >
              {t`Cancel`}
            </Button>,
          ]}
        >
          <div>{t`This action will soft delete the following:`}</div>
          {itemsToDelete.map((item) => (
            <span
              key={item.hostname}
              id={`item-to-be-deleted-${item.hostname}`}
            >
              <strong>{item.hostname}</strong>
              <br />
            </span>
          ))}
          {shouldShowDeleteWarning && (
            <WarningMessage
              variant="warning"
              isInline
              title={buildDeleteWarning()}
            />
          )}
        </AlertModal>
      )}
    </>
  );
}

export default HostMetricsDeleteButton;
