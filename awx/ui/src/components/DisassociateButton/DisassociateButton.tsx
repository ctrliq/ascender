import type { SummaryFields } from 'types/api';
import React, { useState, useEffect, useContext } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Button, Tooltip, DropdownItem } from '@patternfly/react-core';

import styled from 'styled-components';
import { KebabifiedContext } from 'contexts/Kebabified';

import AlertModal from '../AlertModal';

const ModalNote = styled.div`
  margin-bottom: var(--pf-v6-global--spacer--xl);
`;

/** An item the list can disassociate, with what the button reads off it. */
export interface DisassociableItem {
  id: number;
  name?: string | null;
  hostname?: string | null;
  /** Instances only: a control node cannot be disassociated. */
  node_type?: string | null;
  summary_fields?: SummaryFields;
  [key: string]: unknown;
}

export interface DisassociateButtonProps {
  itemsToDisassociate?: DisassociableItem[];
  modalNote?: React.ReactNode;
  modalTitle?: React.ReactNode;
  onDisassociate: () => void;
  verifyCannotDisassociate?: boolean;
  isProtectedInstanceGroup?: boolean;
  [key: string]: unknown;
}

function DisassociateButton({
  itemsToDisassociate = [],
  modalNote = '',
  modalTitle = '',
  onDisassociate,
  verifyCannotDisassociate = true,
  isProtectedInstanceGroup = false,
}: DisassociateButtonProps) {
  const { t } = useLingui();
  if (!modalTitle) {
    modalTitle = t`Disassociate?`;
  }
  const [isOpen, setIsOpen] = useState(false);
  const { isKebabified, onKebabModalChange } = useContext(KebabifiedContext);

  const handleDisassociate = () => {
    onDisassociate?.();
    setIsOpen(false);
  };

  useEffect(() => {
    if (isKebabified) {
      onKebabModalChange?.(isOpen);
    }
  }, [isKebabified, isOpen, onKebabModalChange]);

  function cannotDisassociateAllOthers(item: DisassociableItem) {
    return !item.summary_fields?.user_capabilities?.delete;
  }
  function cannotDisassociateInstances(item: DisassociableItem) {
    return (
      item.node_type === 'control' ||
      (isProtectedInstanceGroup && item.node_type === 'hybrid')
    );
  }

  const cannotDisassociate = itemsToDisassociate.some(
    (i) => i.type === 'instance'
  )
    ? cannotDisassociateInstances
    : cannotDisassociateAllOthers;

  function renderTooltip() {
    if (verifyCannotDisassociate) {
      const itemsUnableToDisassociate = itemsToDisassociate
        .filter(cannotDisassociate)
        .map((item) => item.name ?? item.hostname)
        .join(', ');
      // cannotDisassociate is one of the two predicates above, so it is always
      // truthy: this ternary always took the instances branch, and a list of
      // anything else was checked with a predicate that only ever matches an
      // instance. Apply the predicate that was chosen for the list.
      if (itemsToDisassociate.some(cannotDisassociate)) {
        return (
          <div>
            {t`You do not have permission to disassociate the following: ${itemsUnableToDisassociate}`}
          </div>
        );
      }
    }

    if (itemsToDisassociate.length) {
      return t`Disassociate`;
    }
    return t`Select a row to disassociate`;
  }

  let isDisabled = false;
  if (verifyCannotDisassociate) {
    isDisabled = itemsToDisassociate.some(cannotDisassociate);
  }

  // NOTE: Once PF supports tooltips on disabled elements,
  // we can delete the extra <div> around the <DeleteButton> below.
  // See: https://github.com/patternfly/patternfly-react/issues/1894
  return (
    <>
      {isKebabified ? (
        <DropdownItem
          key="add"
          aria-label={t`disassociate`}
          isDisabled={isDisabled || !itemsToDisassociate.length}
          component="button"
          ouiaId="disassociate-tooltip"
          onClick={() => setIsOpen(true)}
        >
          {t`Disassociate`}
        </DropdownItem>
      ) : (
        <Tooltip content={renderTooltip()} position="top">
          <div>
            <Button
              ouiaId="disassociate-button"
              variant="secondary"
              aria-label={t`Disassociate`}
              onClick={() => setIsOpen(true)}
              isDisabled={isDisabled || !itemsToDisassociate.length}
            >
              {t`Disassociate`}
            </Button>
          </div>
        </Tooltip>
      )}

      {isOpen && (
        <AlertModal
          isOpen={isOpen}
          title={modalTitle}
          variant="warning"
          onClose={() => setIsOpen(false)}
          actions={[
            <Button
              ouiaId="disassociate-modal-confirm"
              key="disassociate"
              variant="danger"
              aria-label={t`confirm disassociate`}
              onClick={handleDisassociate}
            >
              {t`Disassociate`}
            </Button>,
            <Button
              ouiaId="disassociate-modal-cancel"
              key="cancel"
              variant="link"
              aria-label={t`Cancel`}
              onClick={() => setIsOpen(false)}
            >
              {t`Cancel`}
            </Button>,
          ]}
        >
          {modalNote && <ModalNote>{modalNote}</ModalNote>}

          <div>{t`This action will disassociate the following:`}</div>

          {itemsToDisassociate.map((item) => (
            <span key={item.id}>
              <strong>{item.hostname ? item.hostname : item.name}</strong>
              <br />
            </span>
          ))}
        </AlertModal>
      )}
    </>
  );
}

export default DisassociateButton;
