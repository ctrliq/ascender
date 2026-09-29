import type { SearchableKey } from 'components/PaginatedTable';
import type { SearchColumn, SortColumn } from 'types/api';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import {
  parseQueryString,
  mergeParams,
  removeParams,
  updateQueryString,
} from 'util/qs';
import type { QSConfig, QSParamValue } from 'util/qs';
import DataListToolbar from '../DataListToolbar';
import type { DataListToolbarProps } from '../DataListToolbar/DataListToolbar';

export interface ListHeaderProps {
  itemCount?: number;
  pagination?: React.ReactNode;
  qsConfig: QSConfig;
  relatedSearchableKeys?: string[];
  /** Lets a list render a toolbar of its own in place of the default one. */
  renderToolbar?: (props: DataListToolbarProps) => React.ReactNode;
  searchColumns?: SearchColumn[];
  searchableKeys?: SearchableKey[];
  sortColumns?: SortColumn[];
  [key: string]: unknown;
}

function ListHeader({
  itemCount,
  pagination,
  qsConfig,
  relatedSearchableKeys = [],
  renderToolbar = (toolbarProps: DataListToolbarProps) => (
    <DataListToolbar {...toolbarProps} />
  ),
  searchColumns,
  searchableKeys = [],
  sortColumns,
}: ListHeaderProps) {
  const { search, pathname } = useLocation();
  const [isFilterCleared, setIsFilterCleared] = useState(false);
  const navigate = useNavigate();

  const handleSearch = (key: string, value: QSParamValue) => {
    const params = parseQueryString(qsConfig, search);
    const qs = updateQueryString(qsConfig, search, {
      ...mergeParams(params, { [key]: value }),
      page: 1,
    });
    pushHistoryState(qs);
  };

  /*
   * The box as it is typed in: one value for the key rather than another chip
   * beside the last one, back on the first page, and in place of the address
   * rather than after it, so a typed word leaves one entry in the history and
   * not one per letter.
   */
  const handleLiveSearch = (key: string, value: QSParamValue) => {
    const qs = updateQueryString(qsConfig, search, {
      [key]: value,
      page: 1,
    });
    pushHistoryState(qs, true);
  };

  const handleReplaceSearch = (key: string, value: QSParamValue) => {
    const qs = updateQueryString(qsConfig, search, {
      [key]: value,
    });
    pushHistoryState(qs);
  };

  const handleRemove = (key: string, value: QSParamValue) => {
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

  const handleSort = (key?: string, order?: string) => {
    const qs = updateQueryString(qsConfig, search, {
      order_by: (order === 'ascending' ? key : `-${key}`) as QSParamValue,
      page: null,
    });
    pushHistoryState(qs);
  };

  const pushHistoryState = (queryString: unknown, replace = false) => {
    navigate(queryString ? `${pathname}?${queryString}` : pathname, {
      replace,
    });
  };

  /* An empty list keeps its whole toolbar, so Add and the search that
     emptied it stay where they are. */
  return (
    <>
      {renderToolbar({
        itemCount,
        searchColumns,
        sortColumns,
        searchableKeys,
        relatedSearchableKeys,
        onSearch: handleSearch,
        onReplaceSearch: handleReplaceSearch,
        onLiveSearch: handleLiveSearch,
        onSort: handleSort,
        onRemove: handleRemove,
        clearAllFilters: handleRemoveAll,
        qsConfig,
        pagination,
        isFilterCleared,
      })}
    </>
  );
}

export default ListHeader;
