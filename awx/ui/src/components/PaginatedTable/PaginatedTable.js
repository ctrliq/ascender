//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React, { useEffect } from 'react';
import { Table, Tbody } from '@patternfly/react-table';
import { useLocation, useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';

import { parseQueryString, updateQueryString } from 'util/qs';
import ListHeader from '../ListHeader';
import ContentEmpty from '../ContentEmpty';
import ContentError from '../ContentError';
import ContentLoading from '../ContentLoading';
import Pagination from '../Pagination';
import DataListToolbar from '../DataListToolbar';
import LoadingSpinner from '../LoadingSpinner';

// Stable default so the clearSelected effect dep does not change every render.
const noop = () => {};

function PaginatedTable({
  contentError = null,
  hasContentLoading = false,
  emptyStateControls,
  items,
  itemCount,
  qsConfig,
  headerRow,
  renderRow,
  toolbarSearchColumns = [],
  toolbarSearchableKeys = [],
  toolbarRelatedSearchableKeys = [],
  pluralizedItemName = null,
  showPageSizeOptions = true,
  renderToolbar = (props) => <DataListToolbar {...props} />,
  emptyContentMessage,
  clearSelected = noop,
  ouiaId = null,
}) {
  const { t } = useLingui();
  const location = useLocation();
  const { search, pathname } = location;
  const navigate = useNavigate();
  if (!pluralizedItemName) {
    pluralizedItemName = t`Items`;
  }

  useEffect(() => {
    clearSelected();
  }, [location.search, clearSelected]);

  const pushHistoryState = (qs) => {
    navigate(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleSetPage = (event, pageNumber) => {
    const qs = updateQueryString(qsConfig, search, {
      page: pageNumber,
    });
    pushHistoryState(qs);
  };

  const handleSetPageSize = (event, pageSize, page) => {
    const qs = updateQueryString(qsConfig, search, {
      page_size: pageSize,
      page,
    });
    pushHistoryState(qs);
  };

  const searchColumns = toolbarSearchColumns.length
    ? toolbarSearchColumns
    : [
        {
          name: t`Name`,
          key: 'name',
          isDefault: true,
        },
      ];
  const queryParams = parseQueryString(qsConfig, location.search);

  const dataListLabel = t({
    message: `${pluralizedItemName} List`,
    comment: 'Aria label for paginated table list'
  });
  const emptyContentTitle = t({
    message: `No ${pluralizedItemName} Found`,
    comment: 'Title when no items are found'
  });

  let Content;
  if (hasContentLoading && items.length <= 0) {
    Content = <ContentLoading />;
  } else if (contentError) {
    Content = <ContentError error={contentError} />;
  } else if (items.length <= 0) {
    Content = (
      <ContentEmpty
        title={emptyContentTitle}
        message={
          emptyContentMessage ||
          t({
            message: `Please add ${pluralizedItemName} to populate this list`,
            comment: 'Message when list is empty'
          })
        }
      />
    );
  } else {
    Content = (
      <div css="overflow: auto">
        {hasContentLoading && <LoadingSpinner />}
        <Table
          aria-label={dataListLabel}
          ouiaId={ouiaId || `paginated-table-${pluralizedItemName}`}
          variant="compact"
        >
          {headerRow}
          <Tbody>{items.map(renderRow)}</Tbody>
        </Table>
      </div>
    );
  }

  const ToolbarPagination = (
    <Pagination
      isCompact
      dropDirection="down"
      itemCount={itemCount}
      page={queryParams.page || 1}
      perPage={queryParams.page_size}
      perPageOptions={
        showPageSizeOptions
          ? [
              { title: '5', value: 5 },
              { title: '10', value: 10 },
              { title: '20', value: 20 },
              { title: '50', value: 50 },
            ]
          : []
      }
      onSetPage={handleSetPage}
      onPerPageSelect={handleSetPageSize}
      ouiaId="top-pagination"
    />
  );

  return (
    <>
      <ListHeader
        emptyStateControls={emptyStateControls}
        itemCount={itemCount}
        pagination={ToolbarPagination}
        qsConfig={qsConfig}
        relatedSearchableKeys={toolbarRelatedSearchableKeys}
        renderToolbar={renderToolbar}
        searchColumns={searchColumns}
        searchableKeys={toolbarSearchableKeys}
      />
      {Content}
      {items.length ? (
        <Pagination
          variant="bottom"
          itemCount={itemCount}
          page={queryParams.page || 1}
          perPage={queryParams.page_size}
          perPageOptions={
            showPageSizeOptions
              ? [
                  { title: '5', value: 5 },
                  { title: '10', value: 10 },
                  { title: '20', value: 20 },
                  { title: '50', value: 50 },
                ]
              : []
          }
          onSetPage={handleSetPage}
          onPerPageSelect={handleSetPageSize}
          ouiaId="bottom-pagination"
        />
      ) : null}
    </>
  );
}

export { PaginatedTable as _PaginatedTable };
export default PaginatedTable;
