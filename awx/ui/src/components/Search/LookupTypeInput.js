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

function LookupTypeInput({
  value = '',
  type = 'string',
  setValue,
  maxSelectHeight = '300px',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const { t } = useLingui();

  const allOptions = useMemo(
    () => [
      {
        id: 'exact-option-select',
        value: 'exact',
        description: t`Exact match (default lookup if not specified).`,
        show: true,
      },
      {
        id: 'iexact-option-select',
        value: 'iexact',
        description: t`Case-insensitive version of exact.`,
        show: type === 'string',
      },
      {
        id: 'contains-option-select',
        value: 'contains',
        description: t`Field contains value.`,
        show: type === 'string',
      },
      {
        id: 'icontains-option-select',
        value: 'icontains',
        description: t`Case-insensitive version of contains`,
        show: type === 'string',
      },
      {
        id: 'startswith-option-select',
        value: 'startswith',
        description: t`Field starts with value.`,
        show: type !== 'datetime',
      },
      {
        id: 'istartswith-option-select',
        value: 'istartswith',
        description: t`Case-insensitive version of startswith.`,
        show: type !== 'datetime',
      },
      {
        id: 'endswith-option-select',
        value: 'endswith',
        description: t`Field ends with value.`,
        show: type !== 'datetime',
      },
      {
        id: 'iendswith-option-select',
        value: 'iendswith',
        description: t`Case-insensitive version of endswith.`,
        show: type !== 'datetime',
      },
      {
        id: 'regex-option-select',
        value: 'regex',
        description: t`Field matches the given regular expression.`,
        show: true,
      },
      {
        id: 'iregex-option-select',
        value: 'iregex',
        description: t`Case-insensitive version of regex.`,
        show: true,
      },
      {
        id: 'gt-option-select',
        value: 'gt',
        description: t`Greater than comparison.`,
        show: type !== 'json',
      },
      {
        id: 'gte-option-select',
        value: 'gte',
        description: t`Greater than or equal to comparison.`,
        show: type !== 'json',
      },
      {
        id: 'lt-option-select',
        value: 'lt',
        description: t`Less than comparison.`,
        show: type !== 'json',
      },
      {
        id: 'lte-option-select',
        value: 'lte',
        description: t`Less than or equal to comparison.`,
        show: type !== 'json',
      },
      {
        id: 'isnull-option-select',
        value: 'isnull',
        description: t`Check whether the given field or related object is null; expects a boolean value.`,
        show: true,
      },
      {
        id: 'in-option-select',
        value: 'in',
        description: t`Check whether the given field's value is present in the list provided; expects a comma-separated list of items.`,
        show: true,
      },
    ],
    [t, type]
  );

  const visibleOptions = allOptions.filter((opt) => opt.show);

  const filteredOptions = filterValue
    ? visibleOptions.filter((opt) =>
        opt.value.toLowerCase().includes(filterValue.toLowerCase())
      )
    : visibleOptions;

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
              placeholder={t`Lookup type`}
              aria-label={t`Lookup typeahead`}
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
      <SelectList style={{ maxHeight: maxSelectHeight, overflowY: 'auto' }}>
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
export default LookupTypeInput;
