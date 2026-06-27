import React, { useState, useEffect } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useLocation } from 'react-router';
import {
	Button,
	ButtonVariant,
	InputGroup,
	TextInput,
	ToolbarGroup,
	ToolbarItem,
	ToolbarFilter,
	InputGroupItem,
	Select,
	SelectOption,
	SelectList,
	MenuToggle
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { parseQueryString } from 'util/qs';
import AdvancedSearch from './AdvancedSearch';
import getChipsByKey from './getChipsByKey';

const SubmitButtonWrapper = styled.div`
  ${(props) => (props.$disabled ? 'cursor: not-allowed;' : '')}
`;
SubmitButtonWrapper.displayName = 'SubmitButtonWrapper';

const DateInputGroup = styled(InputGroup)`
  /* keep the operator select at its natural width so the date input
     next to it stays visible */
  & > .pf-v6-c-select {
    width: auto;
    flex: 0 0 auto;
  }
  & > .pf-v6-c-form-control {
    flex: 1 1 auto;
  }
`;

const NoOptionDropdown = styled.div`
  align-self: stretch;
  border: 1px solid var(--pf-v6-global--BorderColor--300);
  padding: 5px 15px;
  white-space: nowrap;
  border-bottom-color: var(--pf-v6-global--BorderColor--200);
`;

function Search({
  columns,
  onSearch = null,
  onReplaceSearch,
  onRemove = null,
  qsConfig,
  searchableKeys = [],
  relatedSearchableKeys,
  onShowAdvancedSearch,
  isDisabled = false,
  maxSelectHeight = '300px',
  enableNegativeFiltering = true,
  enableRelatedFuzzyFiltering = true,
  handleIsAnsibleFactsSelected,
  isFilterCleared,
}) {
  const { t } = useLingui();
  const location = useLocation();
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [searchKey, setSearchKey] = useState(
    (() => {
      const defaultColumn = columns.filter((col) => col.isDefault);

      if (defaultColumn.length !== 1) {
        throw new Error(
          'One (and only one) searchColumn must be marked isDefault: true'
        );
      }

      return defaultColumn[0]?.key;
    })()
  );
  const [searchValue, setSearchValue] = useState('');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [dateOperator, setDateOperator] = useState('gte');
  const [isDateOperatorOpen, setIsDateOperatorOpen] = useState(false);

  const params = parseQueryString(qsConfig, location.search);
  if (params?.host_filter) {
    params.ansible_facts = params.host_filter.substring(
      'ansible_facts__'.length
    );
    delete params.host_filter;
  }

  const searchChips = getChipsByKey(params, columns, qsConfig);
  const [chipsByKey, setChipsByKey] = useState(
    JSON.parse(JSON.stringify(searchChips))
  );

  useEffect(() => {
    Object.keys(chipsByKey).forEach((el) => {
      chipsByKey[el].chips = [];
    });
    setChipsByKey({ ...chipsByKey, ...searchChips });
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDropdownSelect = (_event, selectedName) => {
    const { key: actualSearchKey } = columns.find(
      ({ name }) => name === selectedName
    );
    onShowAdvancedSearch(actualSearchKey === 'advanced');
    setIsFilterDropdownOpen(false);
    setIsDateOperatorOpen(false);
    setSearchKey(actualSearchKey);
    setSearchValue('');
    setIsSearchDropdownOpen(false);
  };

  const handleSearch = (e) => {
    // keeps page from fully reloading
    e.preventDefault();

    if (searchValue) {
      onSearch(searchKey, searchValue);
      setSearchValue('');
    }
  };

  const handleTextKeyDown = (e) => {
    if (e.key && e.key === 'Enter') {
      handleSearch(e);
    }
  };

  const dateOperators = [
    ['gte', t`On or after`],
    ['lt', t`Before`],
  ];

  const handleDateSearch = (e) => {
    e.preventDefault();

    if (searchValue) {
      onSearch(`${searchKey}__${dateOperator}`, searchValue);
      setSearchValue('');
    }
  };

  const handleDateKeyDown = (e) => {
    if (e.key && e.key === 'Enter') {
      handleDateSearch(e);
    }
  };

  const handleFilterDropdownSelect = (key, _event, actualValue) => {
    const currentSelections = chipsByKey[key]?.chips.map((chip) => {
      const [, ...val] = chip.key.split(':');
      return val.join(':');
    }) || [];
    if (currentSelections.includes(actualValue)) {
      onRemove(key, actualValue);
    } else {
      onSearch(key, actualValue);
    }
  };

  const { name: searchColumnName } = columns.find(
    ({ key }) => key === searchKey
  );

  return (
    <ToolbarGroup variant="filter-group">
      <ToolbarItem>
        {columns.filter(({ key }) => key !== searchKey).length > 0 ? (
          <Select
            className="simpleKeySelect"
            isOpen={isSearchDropdownOpen}
            onOpenChange={setIsSearchDropdownOpen}
            onSelect={handleDropdownSelect}
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setIsSearchDropdownOpen(!isSearchDropdownOpen)}
                isExpanded={isSearchDropdownOpen}
                isDisabled={isDisabled}
                aria-label={t`Simple key select`}
                ouiaId="simple-key-select"
              >
                {searchColumnName}
              </MenuToggle>
            )}
          >
            <SelectList>
              {columns
                .filter(({ key }) => key !== searchKey)
                .map(({ key, name }) => (
                  <SelectOption
                    data-cy={`select-option-${key}`}
                    id={`select-option-${key}`}
                    key={key}
                    value={name}
                  >
                    {name}
                  </SelectOption>
                ))}
            </SelectList>
          </Select>
        ) : (
          <NoOptionDropdown>{searchColumnName}</NoOptionDropdown>
        )}
      </ToolbarItem>
      {columns.map(({ key, name, options, isBoolean, booleanLabels = {} }) => (
        <ToolbarFilter
          labels={chipsByKey[key] ? chipsByKey[key].chips : []}
          deleteLabel={(unusedKey, chip) => {
            const [columnKey, ...value] = chip.key.split(':');
            onRemove(columnKey, value.join(':'));
          }}
          categoryName={chipsByKey[key] ? chipsByKey[key].label : key}
          key={key}
          showToolbarItem={searchKey === key}
        >
          {(key === 'advanced' && (
            <AdvancedSearch
              onSearch={onSearch}
              searchableKeys={searchableKeys}
              relatedSearchableKeys={relatedSearchableKeys}
              maxSelectHeight={maxSelectHeight}
              enableNegativeFiltering={enableNegativeFiltering}
              enableRelatedFuzzyFiltering={enableRelatedFuzzyFiltering}
              handleIsAnsibleFactsSelected={handleIsAnsibleFactsSelected}
              isFilterCleared={isFilterCleared}
            />
          )) ||
            (options && (
              <Select
                aria-label={name}
                isOpen={isFilterDropdownOpen}
                onOpenChange={setIsFilterDropdownOpen}
                onSelect={(event, selection) =>
                  handleFilterDropdownSelect(key, event, selection)
                }
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                    isExpanded={isFilterDropdownOpen}
                    isDisabled={isDisabled}
                    ouiaId={`filter-by-${key}`}
                  >
                    {t`Filter By ${name}`}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  {options.map(([optionKey, optionLabel]) => {
                    const currentSelections = chipsByKey[key]?.chips.map((chip) => {
                      const [, ...val] = chip.key.split(':');
                      return val.join(':');
                    }) || [];
                    return (
                      <SelectOption
                        key={optionKey}
                        value={optionKey}
                        id={`select-option-${optionKey}`}
                        hasCheckbox
                        isSelected={currentSelections.includes(optionKey)}
                      >
                        {optionLabel}
                      </SelectOption>
                    );
                  })}
                </SelectList>
              </Select>
            )) ||
            (isBoolean && (
              <Select
                aria-label={name}
                isOpen={isFilterDropdownOpen}
                onOpenChange={setIsFilterDropdownOpen}
                onSelect={(_event, selection) => {
                  onReplaceSearch(key, selection);
                  setIsFilterDropdownOpen(false);
                }}
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                    isExpanded={isFilterDropdownOpen}
                    isDisabled={isDisabled}
                    ouiaId={`filter-by-${key}`}
                    style={{ maxHeight: maxSelectHeight }}
                  >
                    {chipsByKey[key].chips[0]?.label || t`Filter By ${name}`}
                  </MenuToggle>
                )}
              >
                <SelectList>
                  <SelectOption key="true" value="true">
                    {booleanLabels.true || t`Yes`}
                  </SelectOption>
                  <SelectOption key="false" value="false">
                    {booleanLabels.false || t`No`}
                  </SelectOption>
                </SelectList>
              </Select>
            )) ||
            ((qsConfig.dateFields || []).includes(key) && (
              <DateInputGroup>
                <Select
                  className="dateOperatorSelect"
                  aria-label={t`Date operator select`}
                  isOpen={isDateOperatorOpen}
                  onOpenChange={setIsDateOperatorOpen}
                  onSelect={(_event, selection) => {
                    const [op] = dateOperators.find(
                      ([, label]) => label === selection
                    );
                    setDateOperator(op);
                    setIsDateOperatorOpen(false);
                  }}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => setIsDateOperatorOpen(!isDateOperatorOpen)}
                      isExpanded={isDateOperatorOpen}
                      isDisabled={isDisabled}
                      aria-label={t`Date operator select`}
                      ouiaId={`date-operator-select-${key}`}
                    >
                      {dateOperators.find(([op]) => op === dateOperator)[1]}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    {dateOperators.map(([op, label]) => (
                      <SelectOption key={op} value={label}>
                        {label}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
                <TextInput
                  data-cy="date-search-input"
                  type="date"
                  aria-label={t`Date search input`}
                  value={searchValue}
                  onChange={(_event, val) => setSearchValue(val)}
                  onKeyDown={handleDateKeyDown}
                  isDisabled={isDisabled}
                />
                <SubmitButtonWrapper $disabled={!searchValue}>
                  <Button icon={<SearchIcon />}
                    ouiaId="date-search-submit-button"
                    variant={ButtonVariant.control}
                    isDisabled={!searchValue || isDisabled}
                    aria-label={t`Search submit button`}
                    onClick={handleDateSearch}
                   />
                </SubmitButtonWrapper>
              </DateInputGroup>
            )) || (
              <InputGroup>
                <InputGroupItem isFill ><TextInput
                  data-cy="search-text-input"
                  type={
                    (qsConfig.integerFields.find(
                      (field) => field === searchKey
                    ) &&
                      'number') ||
                    'search'
                  }
                  aria-label={t`Search text input`}
                  value={searchValue}
                  onChange={(_event, val) => setSearchValue(val)}
                  onKeyDown={handleTextKeyDown}
                  isDisabled={isDisabled}
                /></InputGroupItem>
                <InputGroupItem><SubmitButtonWrapper $disabled={!searchValue}>
                  <Button icon={<SearchIcon />}
                    ouiaId="search-submit-button"
                    variant={ButtonVariant.control}
                    isDisabled={!searchValue || isDisabled}
                    aria-label={t`Search submit button`}
                    onClick={handleSearch}
                   />
                </SubmitButtonWrapper></InputGroupItem>
              </InputGroup>
            )}
        </ToolbarFilter>
      ))}
      {/* Add a ToolbarFilter for any key that doesn't have it's own
      search column so the chips show up */}
      {Object.keys(chipsByKey)
        .filter((val) => columns.map((val2) => val2.key).indexOf(val) === -1)
        .map((leftoverKey) => (
          <ToolbarFilter
            labels={chipsByKey[leftoverKey] ? chipsByKey[leftoverKey].chips : []}
            deleteLabel={(unusedKey, chip) => {
              const [columnKey, ...value] = chip.key.split(':');
              if (columnKey === 'ansible_facts') {
                onRemove('host_filter', `${columnKey}__${value}`);
              } else {
                onRemove(columnKey, value.join(':'));
              }
            }}
            categoryName={
              chipsByKey[leftoverKey]
                ? chipsByKey[leftoverKey].label
                : leftoverKey
            }
            key={leftoverKey}
          />
        ))}
    </ToolbarGroup>
  );
}

export default Search;
