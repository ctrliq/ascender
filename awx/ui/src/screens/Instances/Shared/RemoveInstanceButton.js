import React, { useContext, useState, useEffect } from 'react';
import { msg, Plural } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { KebabifiedContext } from 'contexts/Kebabified';
import {
  getRelatedResourceDeleteCounts,
  relatedResourceDeleteRequests,
} from 'util/getRelatedResourceDeleteDetails';
import {
  Button,
  DropdownItem,
  Tooltip,
  Alert,
  Badge,
} from '@patternfly/react-core';
import AlertModal from 'components/AlertModal';
import styled from 'styled-components';
import ErrorDetail from 'components/ErrorDetail';

const WarningMessage = styled(Alert)`
  margin-top: 10px;
`;

const Label = styled.span`
  && {
    margin-right: 10px;
  }
`;

function RemoveInstanceButton({ itemsToRemove, onRemove, isK8s }) {
  const { i18n } = useLingui();
  const { isKebabified, onKebabModalChange } = useContext(KebabifiedContext);
  const [removeMessageError, setRemoveMessageError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [removeDetails, setRemoveDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const cannotRemove = (item) =>
    !(item.node_type === 'execution' || item.node_type === 'hop');

  const toggleModal = async (isOpen) => {
    setRemoveDetails(null);
    setIsLoading(true);
    if (isOpen && itemsToRemove.length > 0) {
      const { results, error } = await getRelatedResourceDeleteCounts(
        relatedResourceDeleteRequests.instance(itemsToRemove[0])
      );

      if (error) {
        setRemoveMessageError(error);
      } else {
        setRemoveDetails(results);
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
    const itemsUnableToremove = itemsToRemove
      .filter(cannotRemove)
      .map((item) => item.hostname)
      .join(', ');
    if (itemsToRemove.some(cannotRemove)) {
      return i18n._(
        msg`You do not have permission to remove instances: ${itemsUnableToremove}`
      );
    }
    if (itemsToRemove.length) {
      return i18n._(msg`Remove`);
    }
    return i18n._(msg`Select a row to remove`);
  };

  const isDisabled =
    itemsToRemove.length === 0 || itemsToRemove.some(cannotRemove);

  const buildRemoveWarning = () => (
    <div>
      <Plural
        value={itemsToRemove.length}
        one={i18n._(
          msg`This intance is currently being used by other resources. Are you sure you want to delete it?`
        )}
        other={i18n._(
          msg`Deprovisioning these instances could impact other resources that rely on them. Are you sure you want to delete anyway?`
        )}
      />
      {removeDetails &&
        Object.entries(removeDetails).map(([key, value]) => (
          <div key={key} aria-label={`${key}: ${value}`}>
            <Label>{key}</Label>
            <Badge>{value}</Badge>
          </div>
        ))}
    </div>
  );

  if (removeMessageError) {
    return (
      <AlertModal
        isOpen={removeMessageError}
        title={i18n._(msg`Error!`)}
        onClose={() => {
          toggleModal(false);
          setRemoveMessageError();
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
            isDisabled={isDisabled || !isK8s}
            isLoading={isLoading}
            ouiaId="remove-button"
            spinnerAriaValueText={isLoading ? 'Loading' : undefined}
            component="button"
            onClick={() => {
              toggleModal(true);
            }}
          >
            {i18n._(msg`Remove`)}
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
              isDisabled={isDisabled || !isK8s}
            >
              {i18n._(msg`Remove`)}
            </Button>
          </div>
        </Tooltip>
      )}

      {isModalOpen && (
        <AlertModal
          variant="danger"
          title={i18n._(msg`Remove Instances`)}
          isOpen={isModalOpen}
          onClose={() => toggleModal(false)}
          actions={[
            <Button
              ouiaId="remove-modal-confirm"
              key="remove"
              variant="danger"
              aria-label={i18n._(msg`Confirm remove`)}
              onClick={handleRemove}
            >
              {i18n._(msg`Remove`)}
            </Button>,
            <Button
              ouiaId="remove-cancel"
              key="cancel"
              variant="link"
              aria-label={i18n._(msg`cancel remove`)}
              onClick={() => {
                toggleModal(false);
              }}
            >
              {i18n._(msg`Cancel`)}
            </Button>,
          ]}
        >
          <div>
            {i18n._(
              msg`This action will remove the following instance and you may need to rerun the install bundle for any instance that was previously connected to:`
            )}
          </div>
          {itemsToRemove.map((item) => (
            <span key={item.id} id={`item-to-be-removed-${item.id}`}>
              <strong>{item.hostname}</strong>
              <br />
            </span>
          ))}
          {removeDetails && (
            <WarningMessage
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
