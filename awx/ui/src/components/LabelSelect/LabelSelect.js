import React, { useState, useEffect } from 'react';
import { func, arrayOf, number, shape, string, oneOfType } from 'prop-types';
import {
  Chip,
  ChipGroup,
  Select,
  SelectOption,
  SelectVariant,
} from '@patternfly/react-core';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { LabelsAPI } from 'api';
import useIsMounted from 'hooks/useIsMounted';
import { useSyncedSelectValue } from '../MultiSelect';

async function loadLabelOptions(setLabels, onError, isMounted) {
  if (!isMounted.current) {
    return;
  }
  let labels;
  try {
    const { data } = await LabelsAPI.read({
      page: 1,
      page_size: 200,
      order_by: 'name',
    });
    labels = data.results;
    setLabels(labels);
    if (data.next && data.next.includes('page=2')) {
      const {
        data: { results },
      } = await LabelsAPI.read({
        page: 2,
        page_size: 200,
        order_by: 'name',
      });
      setLabels(labels.concat(results));
    }
  } catch (err) {
    onError(err);
  }
}

function LabelSelect({ value, placeholder, onChange, onError, createText }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const isMounted = useIsMounted();
  const { i18n } = useLingui();
  const { selections, onSelect, options, setOptions } = useSyncedSelectValue(
    value,
    onChange
  );

  const toggleExpanded = (toggleValue) => {
    setIsExpanded(toggleValue);
  };

  useEffect(() => {
    (async () => {
      await loadLabelOptions(setOptions, onError, isMounted);
      if (!isMounted.current) {
        return;
      }
      setIsLoading(false);
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const renderOptions = (opts) =>
    opts.map((option) => (
      <SelectOption
        key={option.id}
        aria-label={option.name}
        value={option}
        isDisabled={option.isReadOnly}
      >
        {option.name}
      </SelectOption>
    ));

  const onFilter = (event) => {
    if (event) {
      const str = event.target.value.toLowerCase();
      const matches = options.filter((o) => o.name.toLowerCase().includes(str));
      return renderOptions(matches);
    }
    return null;
  };

  const chipGroupComponent = () => (
    <ChipGroup>
      {(selections || []).map((currentChip) => (
        <Chip
          isReadOnly={currentChip.isReadOnly}
          key={currentChip.name}
          onClick={(e) => {
            onSelect(e, currentChip);
          }}
        >
          {currentChip.name}
        </Chip>
      ))}
    </ChipGroup>
  );

  return (
    <Select
      variant={SelectVariant.typeaheadMulti}
      onToggle={toggleExpanded}
      onSelect={(e, item) => {
        if (typeof item === 'string') {
          item = { id: item, name: item };
        }
        onSelect(e, item);
      }}
      onClear={() => onChange(selections.filter((label) => label.isReadOnly))}
      onFilter={onFilter}
      isCreatable
      onCreateOption={(label) => {
        label = label.trim();
        if (!options.includes(label)) {
          setOptions(options.concat({ name: label, id: label }));
        }
        return label;
      }}
      isDisabled={isLoading}
      selections={selections}
      isOpen={isExpanded}
      typeAheadAriaLabel={i18n._(msg`Select Labels`)}
      placeholderText={placeholder}
      createText={createText}
      noResultsFoundText={i18n._(msg`No results found`)}
      ouiaId="template-label-select"
      chipGroupComponent={chipGroupComponent()}
    >
      {renderOptions(options)}
    </Select>
  );
}
LabelSelect.propTypes = {
  value: arrayOf(
    shape({
      id: oneOfType([number, string]).isRequired,
      name: string.isRequired,
    })
  ).isRequired,
  placeholder: string,
  onChange: func.isRequired,
  onError: func.isRequired,
};
LabelSelect.defaultProps = {
  placeholder: '',
};

export default LabelSelect;
