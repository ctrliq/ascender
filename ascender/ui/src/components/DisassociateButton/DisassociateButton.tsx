import type { SummaryFields } from 'types/api';
import React, { useState, useEffect, useContext } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Button, DropdownItem } from '@patternfly/react-core';

import { KebabifiedContext } from 'contexts/Kebabified';

import AlertModal from '../AlertModal';
import './DisassociateButton.css';
import Tooltip from '../Tooltip';

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
  /** What the button says, where a screen wants other than Disassociate. */
  label?: string;
  /**
   * Why an item cannot be disassociated, or null when it can. A list whose
   * rows are held back for a reason other than the viewer's rights says so
   * here, in place of the permission check, and it is always consulted.
   */
  cannotDisassociateReason?: (item: DisassociableItem) => string | null;
  [key: string]: unknown;
}

function DisassociateButton({
  itemsToDisassociate = [],
  modalNote = '',
  modalTitle = '',
  onDisassociate,
  verifyCannotDisassociate = true,
  isProtectedInstanceGroup = false,
  label,
  cannotDisassociateReason,
}: DisassociateButtonProps) {
  const { t } = useLingui();
  const buttonLabel = label ?? t`Disassociate`;
  if (!modalTitle) {
    modalTitle = t`Disassociate from this list?`;
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

  let cannotDisassociate = itemsToDisassociate.some(
    (i) => i.type === 'instance'
  )
    ? cannotDisassociateInstances
    : cannotDisassociateAllOthers;
  if (cannotDisassociateReason) {
    cannotDisassociate = (item: DisassociableItem) =>
      cannotDisassociateReason(item) !== null;
  }
  const shouldVerify = verifyCannotDisassociate || !!cannotDisassociateReason;

  function renderReasons() {
    // One line per reason, naming the rows it holds back, so two rows held
    // back for the same cause read as one sentence rather than two.
    const reasons = new Map<string, string[]>();
    itemsToDisassociate.forEach((item) => {
      const reason = cannotDisassociateReason?.(item);
      if (reason) {
        reasons.set(reason, [
          ...(reasons.get(reason) ?? []),
          String(item.name ?? item.hostname),
        ]);
      }
    });
    return (
      <div>
        {[...reasons.entries()].map(([reason, names]) => (
          <div key={reason}>{`${reason}: ${names.join(', ')}`}</div>
        ))}
      </div>
    );
  }

  function renderTooltip() {
    if (
      cannotDisassociateReason &&
      itemsToDisassociate.some(cannotDisassociate)
    ) {
      return renderReasons();
    }
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
      return buttonLabel;
    }
    return t`Select a row to disassociate`;
  }

  let isDisabled = false;
  if (shouldVerify) {
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
          aria-label={buttonLabel}
          isDisabled={isDisabled || !itemsToDisassociate.length}
          component="button"
          ouiaId="disassociate-tooltip"
          onClick={() => setIsOpen(true)}
        >
          {buttonLabel}
        </DropdownItem>
      ) : (
        <Tooltip content={renderTooltip()} position="top">
          <div>
            <Button
              ouiaId="disassociate-button"
              variant="secondary"
              aria-label={buttonLabel}
              onClick={() => setIsOpen(true)}
              isDisabled={isDisabled || !itemsToDisassociate.length}
            >
              {buttonLabel}
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
              aria-label={t`Confirm Disassociate`}
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
          {modalNote && (
            <div className="ascender-disassociate-button__modal-note">
              {modalNote}
            </div>
          )}

          {/* Disassociating takes the rows out of this list: what they stand
              for stays where it is, which the reader is told before confirming. */}
          <div>{t`This disassociates the following. They are not deleted themselves:`}</div>

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
