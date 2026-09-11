import type { Untyped } from 'types/api';
import React, { useState } from 'react';
import {
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
} from '@patternfly/react-core';

export interface FrequencySelectProps {
  id: string;
  value: unknown[];
  onChange: (...args: Untyped[]) => void;
  onBlur: (...args: Untyped[]) => void;
  placeholderText: React.ReactNode;
  children: React.ReactNode;
  [key: string]: unknown;
}

export default function FrequencySelect({
  id,
  value,
  onChange,
  onBlur,
  placeholderText,
  children,
}: FrequencySelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const onSelectHandler = (
    event: React.SyntheticEvent,
    selectedValue: unknown
  ) => {
    if (selectedValue === 'none') {
      onChange([]);
      setIsOpen(false);
      return;
    }
    const index = value.indexOf(selectedValue);
    if (index === -1) {
      onChange(value.concat(selectedValue));
    } else {
      onChange(value.slice(0, index).concat(value.slice(index + 1)));
    }
  };

  const handleOpenChange = (val: unknown) => {
    if (!val) {
      onBlur();
    }
    setIsOpen(val);
  };

  return (
    <Select
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      onSelect={onSelectHandler}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => handleOpenChange(!isOpen)}
          isExpanded={isOpen}
          ouiaId={`frequency-select-${id}`}
        >
          {placeholderText}
        </MenuToggle>
      )}
    >
      <SelectList>
        {React.Children.map(children, (child) => {
          if (!child) return null;
          if (child.props.value === 'none') {
            return React.cloneElement(child);
          }
          return React.cloneElement(child, {
            hasCheckbox: true,
            isSelected: value.includes(child.props.value),
          });
        })}
      </SelectList>
    </Select>
  );
}

export { SelectOption };
