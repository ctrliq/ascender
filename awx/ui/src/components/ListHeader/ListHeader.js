
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import styled from 'styled-components';
import { Toolbar, ToolbarContent } from '@patternfly/react-core';

import {
  parseQueryString,
  mergeParams,
  removeParams,
  updateQueryString,
} from 'util/qs';
import DataListToolbar from '../DataListToolbar';

const EmptyStateControlsWrapper = styled.div`
  display: flex;
  margin-top: 20px;
  margin-right: 20px;
  margin-bottom: 20px;
  justify-content: flex-end;

  & > :not(:first-child) {
    margin-left: 20px;
  }
`;
function ListHeader({
  emptyStateControls,
  itemCount,
  pagination,
  qsConfig,
  relatedSearchableKeys = [],
  renderToolbar = (toolbarProps) => <DataListToolbar {...toolbarProps} />,
  searchColumns,
  searchableKeys = [],
  sortColumns = null,
}) {
  const { search, pathname } = useLocation();
  const [isFilterCleared, setIsFilterCleared] = useState(false);
  const navigate = useNavigate();

  const handleSearch = (key, value) => {
    const params = parseQueryString(qsConfig, search);
    const qs = updateQueryString(qsConfig, search, {
      ...mergeParams(params, { [key]: value }),
      page: 1,
    });
    pushHistoryState(qs);
  };

  const handleReplaceSearch = (key, value) => {
    const qs = updateQueryString(qsConfig, search, {
      [key]: value,
    });
    pushHistoryState(qs);
  };

  const handleRemove = (key, value) => {
    const oldParams = parseQueryString(qsConfig, search);
    const updatedParams = removeParams(qsConfig, oldParams, {
      [key]: value,
    });
    const qs = updateQueryString(qsConfig, search, updatedParams);
    pushHistoryState(qs);
  };

  const handleRemoveAll = () => {
    const oldParams = parseQueryString(qsConfig, search);
    Object.keys(oldParams).forEach((key) => {
      oldParams[key] = null;
    });
    delete oldParams.page_size;
    delete oldParams.order_by;
    const qs = updateQueryString(qsConfig, search, oldParams);
    setIsFilterCleared(true);
    pushHistoryState(qs);
  };

  const handleSort = (key, order) => {
    const qs = updateQueryString(qsConfig, search, {
      order_by: order === 'ascending' ? key : `-${key}`,
      page: null,
    });
    pushHistoryState(qs);
  };

  const pushHistoryState = (queryString) => {
    navigate(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const params = parseQueryString(qsConfig, search);
  const isEmpty = itemCount === 0 && Object.keys(params).length === 0;
  return (
    <>
      {isEmpty ? (
        <Toolbar
          id={`${qsConfig.namespace}-list-toolbar`}
          clearAllFilters={handleRemoveAll}
          collapseListedFiltersBreakpoint="lg"
          ouiaId={`${qsConfig.namespace}-list-toolbar`}
        >
          <ToolbarContent>
            <EmptyStateControlsWrapper>
              {emptyStateControls}
            </EmptyStateControlsWrapper>
          </ToolbarContent>
        </Toolbar>
      ) : (
        <>
          {renderToolbar({
            itemCount,
            searchColumns,
            sortColumns,
            searchableKeys,
            relatedSearchableKeys,
            onSearch: handleSearch,
            onReplaceSearch: handleReplaceSearch,
            onSort: handleSort,
            onRemove: handleRemove,
            clearAllFilters: handleRemoveAll,
            qsConfig,
            pagination,
            isFilterCleared,
          })}
        </>
      )}
    </>
  );
}

export default ListHeader;
