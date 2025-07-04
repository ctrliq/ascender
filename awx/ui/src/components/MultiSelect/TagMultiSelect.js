import React, { useState } from 'react';
import { func, string } from 'prop-types';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Select, SelectOption, SelectVariant } from '@patternfly/react-core';
import { arrayToString, stringToArray } from 'util/strings';

function TagMultiSelect({ onChange, value }) {
  const { i18n } = useLingui();
  const selections = stringToArray(value);
  const [options, setOptions] = useState(selections);
  const [isExpanded, setIsExpanded] = useState(false);

  const onSelect = (event, item) => {
    let newValue;
    if (selections.includes(item)) {
      newValue = selections.filter((i) => i !== item);
    } else {
      newValue = selections.concat(item);
    }
    onChange(arrayToString(newValue));
  };

  const toggleExpanded = (toggleValue) => {
    setIsExpanded(toggleValue);
  };

  const renderOptions = (opts) =>
    opts.map((option) => (
      <SelectOption key={option} value={option}>
        {option}
      </SelectOption>
    ));

  const onFilter = (event) => {
    if (event) {
      const str = event.target.value.toLowerCase();
      const matches = options.filter((o) => o.toLowerCase().includes(str));
      return renderOptions(matches);
    }
    return null;
  };

  return (
    <Select
      variant={SelectVariant.typeaheadMulti}
      onToggle={toggleExpanded}
      onSelect={onSelect}
      onClear={() => onChange('')}
      onFilter={onFilter}
      isCreatable
      onCreateOption={(name) => {
        name = name.trim();
        if (!options.includes(name)) {
          setOptions(options.concat(name));
        }
        return name;
      }}
      selections={selections}
      isOpen={isExpanded}
      typeAheadAriaLabel={i18n._(msg`Select tags`)}
      noResultsFoundText={i18n._(msg`No results found`)}
      ouiaId="tag-multiselect"
      createText={i18n._(msg`Create`)}
    >
      {renderOptions(options)}
    </Select>
  );
}

TagMultiSelect.propTypes = {
  onChange: func.isRequired,
  value: string.isRequired,
};

export default TagMultiSelect;
