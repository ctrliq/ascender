import React from 'react';
import styled from 'styled-components';

const SelectableItem = styled.div`
  min-width: 200px;
  border: 1px solid var(--pf-v6-global--BorderColor--200);
  border-radius: var(--pf-v6-global--BorderRadius--sm);
  border: 1px solid;
  border-color: ${(props) =>
    props.$isSelected
      ? "var(--pf-t--global--color--brand--default)"
      : "var(--pf-t--global--border--color--200)"};
  margin-right: 20px;
  display: flex;
  cursor: pointer;
`;

const Indicator = styled.div`
  display: flex;
  flex: 0 0 5px;
  background-color: ${(props) =>
    props.$isSelected ? "var(--pf-t--global--color--brand--default)" : null};
`;

const Contents = styled.div`
  padding: 10px 20px;
`;

const Description = styled.p`
  font-size: 14px;
`;

function SelectableCard({
  label = '',
  description = '',
  onClick,
  isSelected = false,
  dataCy,
  ariaLabel = '',
}) {
  return (
    <SelectableItem
      onClick={onClick}
      onKeyPress={onClick}
      role="button"
      tabIndex="0"
      data-cy={dataCy}
      $isSelected={isSelected}
      aria-label={ariaLabel}
    >
      <Indicator $isSelected={isSelected} />
      <Contents>
        <b>{label}</b>
        <Description>{description}</Description>
      </Contents>
    </SelectableItem>
  );
}

export default SelectableCard;
