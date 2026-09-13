import React from 'react';
import { Checkbox as PFCheckbox } from '@patternfly/react-core';
import styled from 'styled-components';

const CheckboxWrapper = styled.div`
  display: flex;
  border: 1px solid var(--pf-v6-global--BorderColor--200);
  border-radius: var(--pf-v6-global--BorderRadius--sm);
  padding: 10px;
`;

const Checkbox = styled(PFCheckbox)`
  width: 100%;
  & label {
    width: 100%;
  }
`;

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
    <CheckboxWrapper>
      <Checkbox
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
    </CheckboxWrapper>
  );
}

export default CheckboxCard;
