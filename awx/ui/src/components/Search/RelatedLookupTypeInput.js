import React, { useState } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Select, SelectOption, SelectVariant } from '@patternfly/react-core';

function RelatedLookupTypeInput({
  value,
  setValue,
  maxSelectHeight,
  enableFuzzyFiltering,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { i18n } = useLingui();
  return (
    <Select
      ouiaId="set-lookup-typeahead"
      aria-label={i18n._(msg`Related search type`)}
      className="lookupSelect"
      variant={SelectVariant.typeahead}
      typeAheadAriaLabel={i18n._(msg`Related search type typeahead`)}
      onToggle={setIsOpen}
      onSelect={(event, selection) => setValue(selection)}
      selections={value}
      isOpen={isOpen}
      placeholderText={i18n._(msg`Related search type`)}
      maxHeight={maxSelectHeight}
      noResultsFoundText={i18n._(msg`No results found`)}
    >
      <SelectOption
        id="name-option-select"
        key="name__icontains"
        value="name__icontains"
        description={i18n._(msg`Fuzzy search on name field.`)}
      />
      <SelectOption
        id="name-exact-option-select"
        key="name"
        value="name"
        description={i18n._(msg`Exact search on name field.`)}
      />
      <SelectOption
        id="id-option-select"
        key="id"
        value="id"
        description={i18n._(msg`Exact search on id field.`)}
      />
      {enableFuzzyFiltering && (
        <SelectOption
          id="search-option-select"
          key="search"
          value="search"
          description={i18n._(
            msg`Fuzzy search on id, name or description fields.`
          )}
        />
      )}
    </Select>
  );
}

export default RelatedLookupTypeInput;
