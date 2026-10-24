import type { Instance } from 'types/api';
import React, { useContext, useState, useEffect } from 'react';
import { Plural, useLingui } from '@lingui/react/macro';
import { KebabifiedContext } from 'contexts/Kebabified';
import type { DeleteCount } from 'util/getRelatedResourceDeleteDetails';
import {
  getRelatedResourceDeleteCounts,
  relatedResourceDeleteRequests,
} from 'util/getRelatedResourceDeleteDetails';
import { Button, Alert, Badge, DropdownItem } from '@patternfly/react-core';

import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import './RemoveInstanceButton.css';
import Tooltip from 'components/Tooltip';

export interface RemoveInstanceButtonProps {
  itemsToRemove: Instance[];
  onRemove: () => void;
  [key: string]: unknown;
}

function RemoveInstanceButton({
  itemsToRemove,
  onRemove,
}: RemoveInstanceButtonProps) {
  const { t, i18n } = useLingui();
  const { isKebabified, onKebabModalChange } = useContext(KebabifiedContext);
  const [removeMessageError, setRemoveMessageError] = useState<unknown>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [removeDetails, setRemoveDetails] = useState<DeleteCount[] | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  // Only execution and hop nodes are ever deprovisioned from here, and not
  // a managed one even of those kinds, since the install owns its lifecycle.
  const isWrongNodeType = (item: Instance) =>
    !(item.node_type === 'execution' || item.node_type === 'hop');
  const cannotRemove = (item: Instance) =>
    isWrongNodeType(item) || Boolean(item.managed);

  const toggleModal = async (isOpen: boolean) => {
    setRemoveDetails(null);
    setIsLoading(true);
    if (isOpen && itemsToRemove.length > 0) {
      const { results, error } = await getRelatedResourceDeleteCounts(
        relatedResourceDeleteRequests.instance(itemsToRemove[0])
      );

      if (error) {
        setRemoveMessageError(error);
      } else {
        setRemoveDetails(results || null);
      }
    }
    setIsModalOpen(isOpen);
    setIsLoading(false);
  };

  const handleRemove = async () => {
    await onRemove();
    toggleModal(false);
  };
  useEffect(() => {
    if (isKebabified) {
      onKebabModalChange(isModalOpen);
    }
  }, [isKebabified, isModalOpen, onKebabModalChange]);

  const renderTooltip = () => {
    const wrongNodeTypes = itemsToRemove.filter(isWrongNodeType);
    const managedItems = itemsToRemove.filter(
      (item) => !isWrongNodeType(item) && item.managed
    );
    // What stands in the way is the kind of node, not the viewer's rights.
    // Both callers render this only on a Kubernetes install, so the install
    // type is never the reason.
    if (wrongNodeTypes.length) {
      const hostnames = wrongNodeTypes.map((item) => item.hostname).join(', ');
      return t`Only execution and hop nodes can be deleted: ${hostnames}`;
    }
    if (managedItems.length) {
      const hostnames = managedItems.map((item) => item.hostname).join(', ');
      return t`Managed instances cannot be deleted: ${hostnames}`;
    }
    if (itemsToRemove.length) {
      return t`Delete`;
    }
    return t`Select a row to delete`;
  };

  const isDisabled =
    itemsToRemove.length === 0 || itemsToRemove.some(cannotRemove);

  const buildRemoveWarning = () => (
    <div>
      <Plural
        value={itemsToRemove.length}
        one="This instance is currently being used by other resources. Are you sure you want to delete it?"
        other="Deleting these instances could impact other resources that rely on them. Are you sure you want to delete anyway?"
      />
      {removeDetails &&
        removeDetails.map(({ label, count }) => (
          <div key={label.id} aria-label={`${i18n._(label)}: ${count}`}>
            <span className="ascender-remove-instance-button__label">
              {i18n._(label)}
            </span>
            <Badge>{count}</Badge>
          </div>
        ))}
    </div>
  );

  if (removeMessageError) {
    return (
      <AlertModal
        isOpen={removeMessageError}
        title={t`Error!`}
        onClose={() => {
          toggleModal(false);
          setRemoveMessageError(undefined);
        }}
      >
        <ErrorDetail error={removeMessageError} />
      </AlertModal>
    );
  }
  return (
    <>
      {isKebabified ? (
        <Tooltip content={renderTooltip()} position="top">
          <DropdownItem
            key="add"
            isDisabled={isDisabled}
            isLoading={isLoading}
            ouiaId="remove-button"
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
              ouiaId="remove-button"
              spinnerAriaValueText={isLoading ? 'Loading' : undefined}
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
          title={
            itemsToRemove.length === 1
              ? t`Delete Instance`
              : t`Delete Instances`
          }
          isOpen={isModalOpen}
          onClose={() => toggleModal(false)}
          actions={[
            <Button
              ouiaId="remove-modal-confirm"
              key="remove"
              variant="danger"
              aria-label={t`Confirm Delete`}
              onClick={handleRemove}
            >
              {t`Delete`}
            </Button>,
            <Button
              ouiaId="remove-cancel"
              key="cancel"
              variant="link"
              aria-label={t`Cancel Delete`}
              onClick={() => {
                toggleModal(false);
              }}
            >
              {t`Cancel`}
            </Button>,
          ]}
        >
          <div>
            {t`This action will delete the following instances, and you may need to rerun the install bundle for any instance that was previously connected to them:`}
          </div>
          {itemsToRemove.map((item) => (
            <span key={item.id} id={`item-to-be-removed-${item.id}`}>
              <strong>{item.hostname}</strong>
              <br />
            </span>
          ))}
          {removeDetails && (
            <Alert
              className="ascender-remove-instance-button__warning-message"
              variant="warning"
              isInline
              title={buildRemoveWarning()}
            />
          )}
        </AlertModal>
      )}
    </>
  );
}

export default RemoveInstanceButton;
