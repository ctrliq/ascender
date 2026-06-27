import React, { useMemo, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Button,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';

function RelatedLookupTypeInput({
  value,
  setValue,
  maxSelectHeight,
  enableFuzzyFiltering,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const { t } = useLingui();

  const allOptions = useMemo(
    () => [
      {
        id: 'name-option-select',
        value: 'name__icontains',
        description: t`Fuzzy search on name field.`,
      },
      {
        id: 'name-exact-option-select',
        value: 'name',
        description: t`Exact search on name field.`,
      },
      {
        id: 'id-option-select',
        value: 'id',
        description: t`Exact search on id field.`,
      },
      ...(enableFuzzyFiltering
        ? [
            {
              id: 'search-option-select',
              value: 'search',
              description: t`Fuzzy search on id, name or description fields.`,
            },
          ]
        : []),
    ],
    [t, enableFuzzyFiltering]
  );

  const filteredOptions = filterValue
    ? allOptions.filter((opt) =>
        opt.value.toLowerCase().includes(filterValue.toLowerCase())
      )
    : allOptions;

  return (
    <Select
      id="set-lookup-typeahead"
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setFilterValue('');
      }}
      onSelect={(_event, selection) => {
        setValue(selection);
        setFilterValue('');
        setIsOpen(false);
      }}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
          className="lookupSelect"
          ouiaId="set-lookup-typeahead"
        >
          <TextInputGroup isPlain>
            <TextInputGroupMain
              value={filterValue || value || ''}
              onClick={() => setIsOpen(true)}
              onChange={(_event, val) => {
                setFilterValue(val);
                setIsOpen(true);
              }}
              onFocus={() => {
                if (value && !filterValue) {
                  setFilterValue('');
                }
              }}
              autoComplete="off"
              placeholder={t`Related search type`}
              aria-label={t`Related search type typeahead`}
            />
            {(filterValue || value) && (
              <TextInputGroupUtilities>
                <Button icon={<TimesIcon />}
                  variant="plain"
                  onClick={() => {
                    setValue(null);
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
      <SelectList
        style={{ maxHeight: maxSelectHeight, overflowY: 'auto' }}
      >
        {filteredOptions.length === 0 ? (
          <SelectOption isDisabled>{t`No results found`}</SelectOption>
        ) : (
          filteredOptions.map((opt) => (
            <SelectOption
              id={opt.id}
              key={opt.value}
              value={opt.value}
              description={opt.description}
            >
              {opt.value}
            </SelectOption>
          ))
        )}
      </SelectList>
    </Select>
  );
}

export default RelatedLookupTypeInput;
