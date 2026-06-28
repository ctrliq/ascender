import React, { useState, useEffect } from 'react';
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
import { useLingui } from '@lingui/react/macro';
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

function LabelSelect({
  value,
  placeholder = '',
  onChange,
  onError,
  createText,
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const isMounted = useIsMounted();
  const { t } = useLingui();
  const { selections, onSelect, options, setOptions } = useSyncedSelectValue(
    value,
    onChange
  );

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

  const filteredOptions = filterValue
    ? options.filter((o) =>
        o.name.toLowerCase().includes(filterValue.toLowerCase())
      )
    : options;

  const hasExactMatch = options.some(
    (o) => o.name.toLowerCase() === filterValue.toLowerCase()
  );

  const handleSelect = (_event, selectedValue) => {
    const selectedOption =
      options.find((o) => String(o.id) === String(selectedValue)) ||
      selections.find((o) => String(o.id) === String(selectedValue));

    if (selectedOption) {
      onSelect(_event, selectedOption);
    } else if (typeof selectedValue === 'string') {
      const trimmed = selectedValue.trim();
      if (trimmed && !options.find((o) => o.name === trimmed)) {
        setOptions(options.concat({ name: trimmed, id: trimmed }));
      }
      const newItem = { id: trimmed, name: trimmed };
      onSelect(_event, newItem);
    }
    setFilterValue('');
  };

  return (
    <Select
      isOpen={isExpanded}
      onOpenChange={(open) => {
        setIsExpanded(open);
        if (!open) setFilterValue('');
      }}
      onSelect={handleSelect}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          onClick={() => setIsExpanded(!isExpanded)}
          isExpanded={isExpanded}
          isDisabled={isLoading}
          ouiaId="template-label-select"
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
              placeholder={
                selections.length === 0 ? placeholder : ''
              }
              aria-label={t`Select Labels`}
            >
              {selections.length > 0 && (
                <LabelGroup>
                  {selections.map((currentChip) => (
                    <Label
                      key={currentChip.name}
                      {...(currentChip.isReadOnly
                        ? { isDisabled: true }
                        : {
                            onClose: () => {
                              onSelect(null, currentChip);
                            },
                          })}
                    >
                      {currentChip.name}
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
                    onChange(
                      selections.filter((label) => label.isReadOnly)
                    );
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
            key={option.id}
            value={String(option.id)}
            aria-label={option.name}
            isDisabled={option.isReadOnly}
            hasCheckbox
            isSelected={selections.some(
              (s) => String(s.id) === String(option.id)
            )}
          >
            {option.name}
          </SelectOption>
        ))}
        {filterValue && !hasExactMatch && (
          <SelectOption
            key={`create-${filterValue.trim()}`}
            value={filterValue.trim()}
          >
            {createText || t`Create`} &quot;{filterValue}&quot;
          </SelectOption>
        )}
        {filteredOptions.length === 0 && !filterValue && (
          <SelectOption isDisabled>{t`No results found`}</SelectOption>
        )}
      </SelectList>
    </Select>
  );
}
export default LabelSelect;
