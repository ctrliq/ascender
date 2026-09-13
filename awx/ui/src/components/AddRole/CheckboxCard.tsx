import React from 'react';
import { Checkbox as PFCheckbox } from '@patternfly/react-core';
import './CheckboxCard.css';

export interface CheckboxCardProps {
  name: string;
  description?: React.ReactNode;
  isSelected?: boolean;
  /**
   * Declared as a method so it stays bivariant: the callers ignore both of
   * the arguments PatternFly's checkbox hands it.
   */
  onSelect?(event: React.FormEvent<HTMLInputElement>, checked: boolean): void;
  itemId: number | string;
}

function CheckboxCard({
  name,
  description = '',
  isSelected = false,
  onSelect,
  itemId,
}: CheckboxCardProps) {
  return (
    <div className="awx-checkbox-card__wrapper">
      <PFCheckbox
        className="awx-checkbox-card__checkbox"
        isChecked={isSelected}
        onChange={onSelect}
        aria-label={name}
        id={`checkbox-card-${itemId}`}
        ouiaId={`checkbox-card-${itemId}`}
        label={
          <>
            <div style={{ fontWeight: 'bold' }}>{name}</div>
            <div>{description}</div>
          </>
        }
        value={itemId}
      />
    </div>
  );
}

export default CheckboxCard;
