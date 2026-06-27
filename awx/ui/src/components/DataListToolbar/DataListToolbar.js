import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import {
	Button,
	Checkbox,
	Dropdown,
	DropdownList,
	MenuToggle,
	Toolbar,
	ToolbarContent as PFToolbarContent,
	ToolbarGroup,
	ToolbarItem,
	ToolbarToggleGroup,
	Tooltip
} from '@patternfly/react-core';
import {
  AngleDownIcon,
  AngleRightIcon,
  EllipsisVIcon,
  SearchIcon,
} from '@patternfly/react-icons';
import { KebabifiedProvider } from 'contexts/Kebabified';
import ExpandCollapse from '../ExpandCollapse';
import Search from '../Search';
import Sort from '../Sort';

const ToolbarContent = styled(PFToolbarContent)`
  & > .pf-v6-c-toolbar__content-section {
    flex-wrap: nowrap;
    align-items: stretch;
  }
  & .pf-v6-c-toolbar__group,
  & .pf-v6-c-toolbar__toggle-group {
    align-items: stretch;
  }
  & .pf-v6-c-toolbar__item,
  & .pf-v6-c-toolbar__filter {
    align-items: stretch;
    align-self: stretch;
  }
  & .pf-v6-c-select {
    height: 100%;
  }
  & .pf-v6-c-menu-toggle:not(.pf-m-plain) {
    height: 100%;
  }
`;

function DataListToolbar({
  isAllExpanded,
  onExpandAll,
  itemCount = 0,
  clearAllFilters = null,
  searchColumns,
  searchableKeys = [],
  relatedSearchableKeys = [],
  sortColumns = null,
  isAllSelected = false,
  onSelectAll = null,
  isCompact = false,
  onSort = null,
  onSearch = null,
  onReplaceSearch = null,
  onRemove,
  onCompact = null,
  onExpand = null,
  additionalControls = [],
  qsConfig,
  pagination,
  enableNegativeFiltering = true,
  enableRelatedFuzzyFiltering = true,
  handleIsAnsibleFactsSelected,
  isFilterCleared,
  advancedSearchDisabled = false,
}) {
  const { t } = useLingui();
  const showExpandCollapse = onCompact && onExpand;
  const [isKebabOpen, setIsKebabOpen] = useState(false);
  const [isKebabModalOpen, setIsKebabModalOpen] = useState(false);
  const [isAdvancedSearchShown, setIsAdvancedSearchShown] = useState(false);

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth;
  const dropdownPosition =
    viewportWidth >= 992 ? 'right' : 'left';

  const onShowAdvancedSearch = (shown) => {
    setIsAdvancedSearchShown(shown);
    setIsKebabOpen(false);
  };

  useEffect(() => {
    if (!isKebabModalOpen) {
      setIsKebabOpen(false);
    }
  }, [isKebabModalOpen]);

  const kebabProviderValue = useMemo(
    () => ({
      isKebabified: true,
      onKebabModalChange: setIsKebabModalOpen,
    }),
    [setIsKebabModalOpen]
  );
  const columns = [...searchColumns];
  if (!advancedSearchDisabled) {
    columns.push({ name: t`Advanced`, key: 'advanced' });
  }
  return (
    <Toolbar
      id={`${qsConfig.namespace}-list-toolbar`}
      ouiaId={`${qsConfig.namespace}-list-toolbar`}
      clearAllFilters={clearAllFilters}
      collapseListedFiltersBreakpoint="lg"
      clearFiltersButtonText={t`Clear all filters`}
    >
      <ToolbarContent>
        {onExpandAll && (
          <ToolbarGroup>
            <ToolbarItem>
              <Button icon={isAllExpanded ? (
                  <AngleDownIcon aria-label={t`Is expanded`} />
                ) : (
                  <AngleRightIcon aria-label={t`Is not expanded`} />
                )}
                onClick={() => {
                  onExpandAll(!isAllExpanded);
                }}
                aria-label={t`Expand all rows`}
                ouiaId="expand-all-rows"
                variant="plain"
               />
            </ToolbarItem>
          </ToolbarGroup>
        )}
        {onSelectAll && (
          <ToolbarGroup>
            <ToolbarItem style={{ alignSelf: 'center' }}>
              <Tooltip content={t`Select all`} position="top">
                <Checkbox
                  isChecked={isAllSelected}
                  onChange={(_event, checked) => onSelectAll(checked)}
                  aria-label={t`Select all`}
                  id="select-all"
                  ouiaId="select-all"
                />
              </Tooltip>
            </ToolbarItem>
          </ToolbarGroup>
        )}
        <ToolbarToggleGroup toggleIcon={<SearchIcon />} breakpoint="lg">
          <ToolbarItem>
            <Search
              qsConfig={qsConfig}
              columns={columns}
              searchableKeys={searchableKeys}
              relatedSearchableKeys={relatedSearchableKeys}
              onSearch={onSearch}
              onReplaceSearch={onReplaceSearch}
              onShowAdvancedSearch={onShowAdvancedSearch}
              onRemove={onRemove}
              enableNegativeFiltering={enableNegativeFiltering}
              enableRelatedFuzzyFiltering={enableRelatedFuzzyFiltering}
              handleIsAnsibleFactsSelected={handleIsAnsibleFactsSelected}
              isFilterCleared={isFilterCleared}
            />
          </ToolbarItem>
          {sortColumns && (
            <ToolbarItem>
              <Sort qsConfig={qsConfig} columns={sortColumns} onSort={onSort} />
            </ToolbarItem>
          )}
        </ToolbarToggleGroup>
        {showExpandCollapse && (
          <ToolbarGroup>
            <ToolbarItem>
              <ExpandCollapse
                isCompact={isCompact}
                onCompact={onCompact}
                onExpand={onExpand}
              />
            </ToolbarItem>
          </ToolbarGroup>
        )}
        {isAdvancedSearchShown && additionalControls.length > 0 && (
          <ToolbarItem>
            <KebabifiedProvider value={kebabProviderValue}>
              <Dropdown
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    data-cy="actions-kebab-toogle"
                    aria-label={t`Actions`}
                    variant="plain"
                    onClick={() => {
                      if (!isKebabModalOpen) {
                        setIsKebabOpen(!isKebabOpen);
                      }
                    }}
                    isExpanded={isKebabOpen}
                  >
                    <EllipsisVIcon />
                  </MenuToggle>
                )}
                isOpen={isKebabOpen}
                onOpenChange={(isOpen) => {
                  if (!isKebabModalOpen) {
                    setIsKebabOpen(isOpen);
                  }
                }}
                popperProps={{ position: dropdownPosition }}
                ouiaId="actions-dropdown"
              >
                <DropdownList>{additionalControls}</DropdownList>
              </Dropdown>
            </KebabifiedProvider>
          </ToolbarItem>
        )}
        {!isAdvancedSearchShown && (
          <ToolbarGroup>
            {additionalControls.map((control) => (
              <ToolbarItem key={control.key}>{control}</ToolbarItem>
            ))}
          </ToolbarGroup>
        )}
        {!isAdvancedSearchShown && pagination && itemCount > 0 && (
          <ToolbarItem variant="pagination" style={{ alignSelf: 'center' }}>{pagination}</ToolbarItem>
        )}
      </ToolbarContent>
    </Toolbar>
  );
}

export default DataListToolbar;
