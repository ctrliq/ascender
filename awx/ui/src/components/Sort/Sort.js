
import React, { useState } from 'react';

import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
	Button,
	ButtonVariant,
	Dropdown,
	DropdownItem,
	DropdownList,
	InputGroup,
	InputGroupItem,
	MenuToggle,
} from '@patternfly/react-core';
import {
  SortAlphaDownIcon,
  SortAlphaDownAltIcon,
  SortNumericDownIcon,
  SortNumericDownAltIcon,
} from '@patternfly/react-icons';

import styled from 'styled-components';
import { parseQueryString } from 'util/qs';

const NoOptionDropdown = styled.div`
  align-self: stretch;
  border: 1px solid var(--pf-v6-global--BorderColor--300);
  padding: 5px 15px;
  white-space: nowrap;
  border-bottom-color: var(--pf-v6-global--BorderColor--200);
`;

function Sort({ columns, qsConfig, onSort = null }) {
  const { t } = useLingui();
  const location = useLocation();
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  let sortKey;
  let sortOrder;
  let isNumeric;

  const queryParams = parseQueryString(qsConfig, location.search);
  if (queryParams.order_by && queryParams.order_by.startsWith('-')) {
    sortKey = queryParams.order_by.substr(1);
    sortOrder = 'descending';
  } else if (queryParams.order_by) {
    sortKey = queryParams.order_by;
    sortOrder = 'ascending';
  }

  if (qsConfig.integerFields.find((field) => field === sortKey)) {
    isNumeric = true;
  } else {
    isNumeric = false;
  }

  const handleDropdownToggle = (isOpen) => {
    setIsSortDropdownOpen(isOpen);
  };

  const handleDropdownSelect = ({ target }) => {
    const { innerText } = target;

    const [{ key }] = columns.filter(({ name }) => name === innerText);
    sortKey = key;
    if (qsConfig.integerFields.find((field) => field === key)) {
      isNumeric = true;
    } else {
      isNumeric = false;
    }

    setIsSortDropdownOpen(false);
    onSort(sortKey, sortOrder);
  };

  const handleSort = () => {
    onSort(sortKey, sortOrder === 'ascending' ? 'descending' : 'ascending');
  };

  const up = 'up';

  const defaultSortedColumn = columns.find(({ key }) => key === sortKey);

  if (!defaultSortedColumn) {
    throw new Error(
      'sortKey must match one of the column keys, check the sortColumns prop passed to <Sort />'
    );
  }

  const sortedColumnName = defaultSortedColumn?.name;

  const sortDropdownItems = columns
    .filter(({ key }) => key !== sortKey)
    .map(({ key, name }) => (
      <DropdownItem
        key={key}
        ouiaId={`${name}-dropdown-item`}
      >
        {name}
      </DropdownItem>
    ));

  let SortIcon;
  if (isNumeric) {
    SortIcon =
      sortOrder === 'ascending' ? SortNumericDownIcon : SortNumericDownAltIcon;
  } else {
    SortIcon =
      sortOrder === 'ascending' ? SortAlphaDownIcon : SortAlphaDownAltIcon;
  }
  return (
    <>
      {sortedColumnName && (
        <InputGroup>
          {(sortDropdownItems.length > 0 && (
            <Dropdown
              onSelect={handleDropdownSelect}
              onOpenChange={setIsSortDropdownOpen}
              popperProps={{ direction: up }}
              isOpen={isSortDropdownOpen}
              ouiaId="sort-dropdown"
              toggle={(toggleRef) => (
                <MenuToggle
                  ref={toggleRef}
                  id="awx-sort"
                  onClick={() => handleDropdownToggle(!isSortDropdownOpen)}
                  isExpanded={isSortDropdownOpen}
                  ouiaId="sort-dropdown-toggle"
                >
                  {sortedColumnName}
                </MenuToggle>
              )}
            >
              <DropdownList>{sortDropdownItems}</DropdownList>
            </Dropdown>
          )) || <NoOptionDropdown>{sortedColumnName}</NoOptionDropdown>}

          <InputGroupItem><Button
            variant={ButtonVariant.control}
            aria-label={t`Sort`}
            onClick={handleSort}
            ouiaId="sort-button"
          >
            <SortIcon />
          </Button></InputGroupItem>
        </InputGroup>
      )}
    </>
  );
}

export default Sort;
