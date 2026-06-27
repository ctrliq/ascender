import React, { useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
	Button,
	ButtonVariant,
	Divider,
	InputGroup,
	TextInput,
	Tooltip,
	InputGroupItem,
	Select,
	SelectOption,
	SelectList,
	SelectGroup,
	MenuToggle,
	TextInputGroup,
	TextInputGroupMain,
	TextInputGroupUtilities
} from '@patternfly/react-core';
import { SearchIcon, QuestionCircleIcon, TimesIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { useLocation } from 'react-router';
import { useConfig } from 'contexts/Config';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import RelatedLookupTypeInput from './RelatedLookupTypeInput';
import LookupTypeInput from './LookupTypeInput';

const SubmitButtonWrapper = styled.div`
  ${(props) => (props.$disabled ? 'cursor: not-allowed;' : '')}
`;
SubmitButtonWrapper.displayName = 'SubmitButtonWrapper';

const AdvancedGroup = styled.div`
  display: flex;

  @media (max-width: 991px) {
    display: grid;
    grid-gap: var(--pf-v6-global--spacer--sm);
  }

  & .pf-v6-c-select {
    min-width: 150px;
  }
`;

const prefixOptions = (t, enableNegativeFiltering) => {
  const opts = [
    {
      id: 'and-option-select',
      value: 'and',
      description: t`Returns results that satisfy this one as well as other filters.  This is the default set type if nothing is selected.`,
    },
    {
      id: 'or-option-select',
      value: 'or',
      description: t`Returns results that satisfy this one or any other filters.`,
    },
  ];
  if (enableNegativeFiltering) {
    opts.push({
      id: 'not-option-select',
      value: 'not',
      description: t`Returns results that have values other than this one as well as other filters.`,
    });
  }
  return opts;
};

function AdvancedSearch({
  onSearch,
  searchableKeys = [],
  relatedSearchableKeys = [],
  maxSelectHeight = '300px',
  enableNegativeFiltering = true,
  enableRelatedFuzzyFiltering = true,
  handleIsAnsibleFactsSelected = () => {},
  isFilterCleared,
}) {
  const { t } = useLingui();
  const relatedKeys = relatedSearchableKeys.filter(
    (sKey) => !searchableKeys.map(({ key }) => key).includes(sKey)
  );
  const [isPrefixDropdownOpen, setIsPrefixDropdownOpen] = useState(false);
  const [isKeyDropdownOpen, setIsKeyDropdownOpen] = useState(false);
  const [prefixSelection, setPrefixSelection] = useState(null);
  const [lookupSelection, setLookupSelection] = useState(null);
  const [keySelection, setKeySelection] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [isTextInputDisabled, setIsTextInputDisabled] = useState(false);
  const [prefixFilterValue, setPrefixFilterValue] = useState('');
  const [keyFilterValue, setKeyFilterValue] = useState('');
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (keySelection === 'ansible_facts') {
      handleIsAnsibleFactsSelected(true);
      setPrefixSelection(null);
    } else {
      handleIsAnsibleFactsSelected(false);
    }
  }, [keySelection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFilterCleared && keySelection === 'ansible_facts') {
      setIsTextInputDisabled(false);
    }
  }, [isFilterCleared, keySelection]);

  useEffect(() => {
    if (
      (pathname.includes('edit') || pathname.includes('add')) &&
      keySelection === 'ansible_facts' &&
      search.includes('ansible_facts')
    ) {
      setIsTextInputDisabled(true);
    } else {
      setIsTextInputDisabled(false);
    }
  }, [keySelection, pathname, search]);

  const config = useConfig();

  const selectedKey = searchableKeys.find((k) => k.key === keySelection);
  const relatedSearchKeySelected =
    keySelection &&
    relatedSearchableKeys.indexOf(keySelection) > -1 &&
    !selectedKey;
  const lookupKeyType =
    keySelection && !relatedSearchKeySelected ? selectedKey?.type : null;

  useEffect(() => {
    if (relatedSearchKeySelected && keySelection !== 'ansible_facts') {
      setLookupSelection('name__icontains');
    } else {
      setLookupSelection(null);
    }
  }, [keySelection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lookupSelection === 'search') {
      setPrefixSelection(null);
    }
  }, [lookupSelection]);

  const handleAdvancedSearch = (e) => {
    // keeps page from fully reloading
    e.preventDefault();

    if (searchValue) {
      const actualPrefix = prefixSelection === 'and' ? null : prefixSelection;
      const actualSearchKey = [actualPrefix, keySelection, lookupSelection]
        .filter((val) => !!val)
        .join('__');
      if (keySelection === 'ansible_facts') {
        const ansibleFactValue = `${actualSearchKey}__${searchValue}`;
        onSearch('host_filter', ansibleFactValue);
      } else {
        onSearch(actualSearchKey, searchValue);
      }
      setSearchValue('');
    }
  };

  const handleAdvancedTextKeyDown = (e) => {
    if (e.key && e.key === 'Enter') {
      handleAdvancedSearch(e);
    }
  };

  const allPrefixOptions = prefixOptions(t, enableNegativeFiltering);
  const filteredPrefixOptions = prefixFilterValue
    ? allPrefixOptions.filter((opt) =>
        opt.value.toLowerCase().includes(prefixFilterValue.toLowerCase())
      )
    : allPrefixOptions;

  const renderSetType = () => (
    <Select
      aria-label={t`Set type select`}
      className="setTypeSelect"
      isOpen={isPrefixDropdownOpen}
      onOpenChange={(open) => {
        setIsPrefixDropdownOpen(open);
        if (!open) setPrefixFilterValue('');
      }}
      onSelect={(_event, selection) => {
        setPrefixSelection(selection);
        setPrefixFilterValue('');
        setIsPrefixDropdownOpen(false);
      }}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          onClick={() => setIsPrefixDropdownOpen(!isPrefixDropdownOpen)}
          isExpanded={isPrefixDropdownOpen}
          isDisabled={lookupSelection === 'search'}
          ouiaId="set-type-typeahead"
        >
          <TextInputGroup isPlain>
            <TextInputGroupMain
              value={prefixFilterValue || prefixSelection || ''}
              onClick={() => setIsPrefixDropdownOpen(true)}
              onChange={(_event, val) => {
                setPrefixFilterValue(val);
                setIsPrefixDropdownOpen(true);
              }}
              autoComplete="off"
              placeholder={t`Set type`}
              aria-label={t`Set type typeahead`}
            />
            {(prefixFilterValue || prefixSelection) && (
              <TextInputGroupUtilities>
                <Button icon={<TimesIcon />}
                  variant="plain"
                  onClick={() => {
                    setPrefixSelection(null);
                    setPrefixFilterValue('');
                  }}
                  aria-label={t`Clear`}
                 />
              </TextInputGroupUtilities>
            )}
          </TextInputGroup>
        </MenuToggle>
      )}
    >
      <SelectList style={{ maxHeight: maxSelectHeight, overflow: 'auto' }}>
        {filteredPrefixOptions.length > 0 ? (
          filteredPrefixOptions.map((opt) => (
            <SelectOption
              id={opt.id}
              key={opt.value}
              value={opt.value}
              description={opt.description}
            >
              {opt.value}
            </SelectOption>
          ))
        ) : (
          <SelectOption isDisabled key="no-results" value="no-results">
            {t`No results found`}
          </SelectOption>
        )}
      </SelectList>
    </Select>
  );

  const renderLookupType = () => {
    if (keySelection === 'ansible_facts') return null;

    return relatedSearchKeySelected ? (
      <RelatedLookupTypeInput
        value={lookupSelection}
        setValue={setLookupSelection}
        maxSelectHeight={maxSelectHeight}
        enableFuzzyFiltering={enableRelatedFuzzyFiltering}
      />
    ) : (
      <LookupTypeInput
        value={lookupSelection}
        type={lookupKeyType}
        setValue={setLookupSelection}
        maxSelectHeight={maxSelectHeight}
      />
    );
  };

  const renderTextInput = () => {
    let placeholderText;
    if (keySelection === 'labels' && lookupSelection === 'search') {
      placeholderText = 'e.g. label_1,label_2';
    }

    if (isTextInputDisabled) {
      return (
        <Tooltip
          content={t`Remove the current search related to ansible facts to enable another search using this key.`}
        >
          <TextInput
            data-cy="advanced-search-text-input"
            type="search"
            aria-label={t`Advanced search value input`}
            isDisabled={!keySelection || isTextInputDisabled}
            value={
              (!keySelection && t`First, select a key`) || searchValue
            }
            onChange={(_event, val) => setSearchValue(val)}
            onKeyDown={handleAdvancedTextKeyDown}
          />
        </Tooltip>
      );
    }

    return (
      <TextInput
        data-cy="advanced-search-text-input"
        type="search"
        aria-label={t`Advanced search value input`}
        isDisabled={!keySelection}
        value={
          (!keySelection && t`First, select a key`) || searchValue
        }
        onChange={(_event, val) => setSearchValue(val)}
        onKeyDown={handleAdvancedTextKeyDown}
        placeholder={placeholderText}
      />
    );
  };

  const renderLookupSelection = () => {
    if (keySelection === 'ansible_facts') return null;
    return lookupSelection === 'search' ? (
      <Tooltip
        content={t`Set type disabled for related search field fuzzy searches`}
      >
        {renderSetType()}
      </Tooltip>
    ) : (
      renderSetType()
    );
  };

  const allKeyOptions = [
    ...searchableKeys.map((k) => ({ key: k.key, group: 'direct' })),
    ...relatedKeys.map((rKey) => ({ key: rKey, group: 'related' })),
  ];
  const filteredKeyOptions = keyFilterValue
    ? allKeyOptions.filter((opt) =>
        opt.key.toLowerCase().includes(keyFilterValue.toLowerCase())
      )
    : allKeyOptions;
  const filteredDirectKeys = filteredKeyOptions.filter(
    (opt) => opt.group === 'direct'
  );
  const filteredRelatedKeys = filteredKeyOptions.filter(
    (opt) => opt.group === 'related'
  );

  return (
    <AdvancedGroup>
      {renderLookupSelection()}
      <Select
        aria-label={t`Key select`}
        className="keySelect"
        isOpen={isKeyDropdownOpen}
        onOpenChange={(open) => {
          setIsKeyDropdownOpen(open);
          if (!open) setKeyFilterValue('');
        }}
        onSelect={(_event, selection) => {
          setKeySelection(selection);
          setKeyFilterValue('');
          setIsKeyDropdownOpen(false);
        }}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            variant="typeahead"
            onClick={() => setIsKeyDropdownOpen(!isKeyDropdownOpen)}
            isExpanded={isKeyDropdownOpen}
            ouiaId="set-key-typeahead"
          >
            <TextInputGroup isPlain>
              <TextInputGroupMain
                value={keyFilterValue || keySelection || ''}
                onClick={() => setIsKeyDropdownOpen(true)}
                onChange={(_event, val) => {
                  setKeyFilterValue(val);
                  setIsKeyDropdownOpen(true);
                }}
                autoComplete="off"
                placeholder={t`Key`}
                aria-label={t`Key typeahead`}
              />
              {(keyFilterValue || keySelection) && (
                <TextInputGroupUtilities>
                  <Button icon={<TimesIcon />}
                    variant="plain"
                    onClick={() => {
                      setKeySelection(null);
                      setKeyFilterValue('');
                    }}
                    aria-label={t`Clear`}
                   />
                </TextInputGroupUtilities>
              )}
            </TextInputGroup>
          </MenuToggle>
        )}
      >
        <SelectList style={{ maxHeight: maxSelectHeight, overflow: 'auto' }}>
          {filteredKeyOptions.length > 0 ? (
            <>
              {filteredDirectKeys.length > 0 && (
                <SelectGroup key="direct keys" label={t`Direct Keys`}>
                  {filteredDirectKeys.map((opt) => (
                    <SelectOption
                      value={opt.key}
                      key={opt.key}
                      id={`select-option-${opt.key}`}
                    >
                      {opt.key}
                    </SelectOption>
                  ))}
                </SelectGroup>
              )}
              {filteredDirectKeys.length > 0 &&
                filteredRelatedKeys.length > 0 && (
                  <Divider key="divider" />
                )}
              {filteredRelatedKeys.length > 0 && (
                <SelectGroup key="related keys" label={t`Related Keys`}>
                  {filteredRelatedKeys.map((opt) => (
                    <SelectOption
                      value={opt.key}
                      key={opt.key}
                      id={`select-option-${opt.key}`}
                    >
                      {opt.key}
                    </SelectOption>
                  ))}
                </SelectGroup>
              )}
            </>
          ) : (
            <SelectOption isDisabled key="no-results" value="no-results">
              {t`No results found`}
            </SelectOption>
          )}
        </SelectList>
      </Select>
      {renderLookupType()}

      <InputGroup>
        {renderTextInput()}
        <InputGroupItem><SubmitButtonWrapper $disabled={!searchValue}>
          <Button icon={<SearchIcon />}
            ouiaId="advanced-search-text-input"
            variant={ButtonVariant.control}
            isDisabled={!searchValue}
            aria-label={t`Search submit button`}
            onClick={handleAdvancedSearch}
           />
        </SubmitButtonWrapper></InputGroupItem>
      </InputGroup>
      <Tooltip
        content={t`Advanced search documentation`}
        position="bottom"
      >
        <Button icon={<QuestionCircleIcon />}
          ouiaId="search-docs-button"
          component="a"
          variant="plain"
          target="_blank"
          href={`${getDocsBaseUrl(config)}/userguide/search_sort.html`}
          rel="noopener noreferrer"
         />
      </Tooltip>
    </AdvancedGroup>
  );
}

export default AdvancedSearch;
