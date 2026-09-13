import React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Thead, Tr, Th as PFTh } from '@patternfly/react-table';
import type {
  ISortBy,
  SortByDirection,
  ThProps,
} from '@patternfly/react-table';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import type { QSConfig, QSParamValue } from 'util/qs';
import { parseQueryString, updateQueryString } from 'util/qs';

const Th = styled(PFTh)<{ $alignRight?: boolean }>`
  --pf-v6-c-table--cell--Overflow: initial;
  --pf-v6-c-table--cell--MaxWidth: none;
  ${(props) => (props.$alignRight ? 'text-align: right;' : '')}
`;

export interface HeaderRowProps {
  qsConfig: QSConfig;
  isExpandable?: boolean;
  isSelectable?: boolean;
  children: React.ReactNode;
  [key: string]: unknown;
}

export default function HeaderRow({
  qsConfig,
  isExpandable,
  isSelectable = true,
  children,
}: HeaderRowProps) {
  const { t } = useLingui();
  const location = useLocation();
  const navigate = useNavigate();

  const params = parseQueryString(qsConfig, location.search);

  const onSort = (key?: string, order?: string) => {
    const qs = updateQueryString(qsConfig, location.search, {
      order_by: (order === 'asc' ? key : `-${key}`) as QSParamValue,
      page: null,
    });
    navigate(qs ? `${location.pathname}?${qs}` : location.pathname);
  };

  const orderBy = params.order_by as string | undefined;
  const sortKey = orderBy?.replace('-', '');
  const sortBy = {
    index: (sortKey || qsConfig.defaultParams?.order_by) as unknown as number,
    direction: (orderBy?.startsWith('-') ? 'desc' : 'asc') as SortByDirection,
  };
  const idPrefix = `${qsConfig.namespace}-table-sort`;

  // empty first Th aligns with checkboxes in table rows
  return (
    <Thead>
      <Tr ouiaId="paginated-table-header-row">
        {isExpandable && <Th screenReaderText={t`Expand`} />}
        {isSelectable && <Th screenReaderText={t`Row select`} />}
        {React.Children.map(children, (child) => {
          if (!React.isValidElement<HeaderCellProps>(child)) {
            return child;
          }
          // Every cell is sorted through the row, so the row is what supplies
          // the four props the cell does not take from its own call site.
          return React.cloneElement(child, {
            onSort,
            sortBy,
            columnIndex: child.props.sortKey as unknown as number,
            idPrefix,
          });
        })}
      </Tr>
    </Thead>
  );
}

/**
 * What a header cell takes. Only sortKey, className, children and tooltip come
 * from the call site; HeaderRow clones in the rest, which is why they are all
 * optional here.
 */
export interface HeaderCellProps {
  sortKey?: string;
  onSort?: (key?: string, order?: string) => void;
  /**
   * PatternFly declares the sorted column as a numeric index; these tables key
   * it by the column's sort key instead, which is what the query string holds,
   * and Th only ever compares it against columnIndex for the active marker.
   */
  sortBy?: ISortBy;
  columnIndex?: number;
  idPrefix?: string;
  className?: string;
  children?: React.ReactNode;
  tooltip?: React.ReactNode;
}

export function HeaderCell({
  sortKey,
  onSort,
  sortBy,
  columnIndex,
  idPrefix,
  className,
  children,
  tooltip,
}: HeaderCellProps) {
  const sort: ThProps['sort'] = sortKey
    ? {
        onSort: (
          event: React.MouseEvent,
          key: number,
          order: SortByDirection
        ) => onSort?.(sortKey, order),
        sortBy: sortBy ?? {},
        columnIndex: columnIndex as number,
      }
    : undefined;
  return (
    <Th
      info={tooltip ? { popover: <div>{tooltip}</div> } : undefined}
      id={sortKey ? `${idPrefix}-${sortKey}` : undefined}
      className={className}
      sort={sort}
      $alignRight={children === 'Actions'}
    >
      {children}
    </Th>
  );
}
