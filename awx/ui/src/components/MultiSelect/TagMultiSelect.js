import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Button,
  Label,
  LabelGroup,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import { arrayToString, stringToArray } from 'util/strings';

function TagMultiSelect({ onChange, value }) {
  const { t } = useLingui();
  const selections = stringToArray(value);
  const [options, setOptions] = useState(selections);
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterValue, setFilterValue] = useState('');

  const onSelect = (_event, item) => {
    let newValue;
    if (selections.includes(item)) {
      newValue = selections.filter((i) => i !== item);
    } else {
      newValue = selections.concat(item);
    }
    onChange(arrayToString(newValue));
    setFilterValue('');
  };

  const filteredOptions = filterValue
    ? options.filter((o) => o.toLowerCase().includes(filterValue.toLowerCase()))
    : options;

  const hasExactMatch = options.some(
    (o) => o.toLowerCase() === filterValue.toLowerCase()
  );

  return (
    <Select
      isOpen={isExpanded}
      onOpenChange={(open) => {
        setIsExpanded(open);
        if (!open) setFilterValue('');
      }}
      onSelect={onSelect}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          onClick={() => setIsExpanded(!isExpanded)}
          isExpanded={isExpanded}
          ouiaId="tag-multiselect"
        >
          <TextInputGroup isPlain>
            <TextInputGroupMain
              value={filterValue}
              onClick={() => setIsExpanded(true)}
              onChange={(_event, val) => {
                setFilterValue(val);
                setIsExpanded(true);
              }}
              autoComplete="off"
              placeholder={selections.length === 0 ? t`Select tags` : ''}
              aria-label={t`Select tags`}
            >
              {selections.length > 0 && (
                <LabelGroup>
                  {selections.map((s) => (
                    <Label
                      key={s}
                      onClose={() => {
                        const newVal = selections.filter((sel) => sel !== s);
                        onChange(arrayToString(newVal));
                      }}
                    >
                      {s}
                    </Label>
                  ))}
                </LabelGroup>
              )}
            </TextInputGroupMain>
            {(filterValue || selections.length > 0) && (
              <TextInputGroupUtilities>
                <Button icon={<TimesIcon />}
                  variant="plain"
                  onClick={() => {
                    onChange('');
                    setFilterValue('');
                  }}
                  aria-label={t`Clear`}
                 />
              </TextInputGroupUtilities>
            )}
          </TextInputGroup>
        </MenuToggle>
      )}
    >
      <SelectList>
        {filteredOptions.map((option) => (
          <SelectOption
            key={option}
            value={option}
            hasCheckbox
            isSelected={selections.includes(option)}
          >
            {option}
          </SelectOption>
        ))}
        {filterValue && !hasExactMatch && (
          <SelectOption
            key={`create-${filterValue.trim()}`}
            value={filterValue.trim()}
            onClick={() => {
              const trimmed = filterValue.trim();
              if (trimmed && !options.includes(trimmed)) {
                setOptions((prev) => prev.concat(trimmed));
              }
            }}
          >
            {t`Create`} &quot;{filterValue.trim()}&quot;
          </SelectOption>
        )}
        {filteredOptions.length === 0 && !filterValue && (
          <SelectOption isDisabled>{t`No results found`}</SelectOption>
        )}
      </SelectList>
    </Select>
  );
}

export default TagMultiSelect;
