import type { SummaryFields } from 'types/api';
import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  Alert,
  Badge,
  Button,
  Tooltip,
  DropdownItem,
} from '@patternfly/react-core';

import { useLingui } from '@lingui/react/macro';
import { KebabifiedContext } from 'contexts/Kebabified';
import { getRelatedResourceDeleteCounts } from 'util/getRelatedResourceDeleteDetails';
import type {
  DeleteCount,
  DeleteRequest,
} from 'util/getRelatedResourceDeleteDetails';
import AlertModal from '../AlertModal';

import ErrorDetail from '../ErrorDetail';

const WarningMessage = styled(Alert)`
  margin-top: 10px;
`;

const Label = styled.span`
  && {
    margin-right: 10px;
  }
`;

/** An item a list's toolbar can delete, with what the button reads off it. */
export interface DeletableItem {
  id: number;
  /** Null on a serializer that allows a blank name, which is why not string. */
  name?: string | null;
  type?: string;
  summary_fields?: SummaryFields;
  [key: string]: unknown;
}

export interface ToolbarDeleteButtonProps {
  itemsToDelete: DeletableItem[];
  pluralizedItemName?: React.ReactNode;
  errorMessage?: React.ReactNode;
  onDelete: () => void;
  /** Builds the related-resource counts to show before the delete is allowed. */
  deleteDetailsRequests?: DeleteRequest[];
  warningMessage?: React.ReactNode;
  deleteMessage?: React.ReactNode;
  /** Returns true for an item the user is not allowed to delete. */
  cannotDelete?: (item: DeletableItem) => boolean;
  [key: string]: unknown;
}

function ToolbarDeleteButton({
  itemsToDelete,
  pluralizedItemName,
  errorMessage,
  onDelete,
  deleteDetailsRequests,
  warningMessage,
  deleteMessage,
  cannotDelete = (item) => !item.summary_fields?.user_capabilities?.delete,
}: ToolbarDeleteButtonProps) {
  const { t, i18n } = useLingui();
  if (!pluralizedItemName) {
    pluralizedItemName = t`Items`;
  }
  const { isKebabified, onKebabModalChange } = useContext(KebabifiedContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteDetails, setDeleteDetails] = useState<
    DeleteCount[] | false | null
  >(null);
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
      deleteDetailsRequests &&
      deleteDetailsRequests.length > 0
    ) {
      const { results, error } = await getRelatedResourceDeleteCounts(
        deleteDetailsRequests
      );

      if (error) {
        setDeleteMessageError(error);
      } else {
        setDeleteDetails(results);
      }
    }
    setIsLoading(false);
    setIsModalOpen(isOpen);
  };

  useEffect(() => {
    if (isKebabified) {
      onKebabModalChange?.(isModalOpen);
    }
  }, [isKebabified, isModalOpen, onKebabModalChange]);

  const renderTooltip = () => {
    const itemsUnableToDelete = itemsToDelete
      .filter(cannotDelete)
      .map((item) => item.name || item.username)
      .join(', ');
    if (itemsToDelete.some(cannotDelete)) {
      return (
        <div>
          {errorMessage ? (
            <>
              <span>{errorMessage}</span>
              <span>{`: ${itemsUnableToDelete}`}</span>
            </>
          ) : (
            t`You do not have permission to delete ${pluralizedItemName}: ${itemsUnableToDelete}`
          )}
        </div>
      );
    }
    if (itemsToDelete.length) {
      return t`Delete`;
    }
    return t`Select a row to delete`;
  };

  const modalTitle = t`Delete ${pluralizedItemName}?`;

  const isDisabled =
    itemsToDelete.length === 0 || itemsToDelete.some(cannotDelete);

  const buildDeleteWarning = () => {
    const deleteMessages = [];
    if (warningMessage) {
      deleteMessages.push(warningMessage);
    }
    if (deleteMessage) {
      if (
        itemsToDelete[0]?.type !== 'inventory' &&
        (itemsToDelete.length > 1 || deleteDetails)
      ) {
        deleteMessages.push(deleteMessage);
      } else if (deleteDetails || itemsToDelete.length > 1) {
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
      {isKebabified ? (
        <Tooltip content={renderTooltip()} position="top">
          <DropdownItem
            key="add"
            isDisabled={isDisabled}
            isLoading={isLoading}
            ouiaId="delete-button"
            component="button"
            onClick={() => {
              toggleModal(true);
            }}
          >
            {t`Delete`}
          </DropdownItem>
        </Tooltip>
      ) : (
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
      )}

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
                deleteDetails && itemsToDelete[0]?.type === 'credential_type'
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
          <div
            style={{ marginBottom: '0.75rem' }}
          >{t`This action will delete the following:`}</div>
          {itemsToDelete.map((item) => (
            <span key={item.id} id={`item-to-be-deleted-${item.id}`}>
              <strong>
                {(item.name || item.username || item.image) as React.ReactNode}
              </strong>
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

export default ToolbarDeleteButton;
