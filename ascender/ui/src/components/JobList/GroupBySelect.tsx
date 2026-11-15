import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
} from '@patternfly/react-core';

import type { QSConfig } from 'util/qs';
import {
  getGroupingMode,
  setGroupingMode,
  GROUP_BY_STATUS,
  GROUP_BY_TEMPLATE,
  type GroupingMode,
} from './stacks';

export interface GroupBySelectProps {
  qsConfig: QSConfig;
}

/**
 * Selection control for the Jobs list grouping mode.  The visible text is the
 * selected option: "No grouping", "Group by status" or "Group by template".
 * Grouping and filters are independent, so the control is always available.
 */
function GroupBySelect({ qsConfig }: GroupBySelectProps) {
  const { t } = useLingui();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const groupingMode = getGroupingMode(location.search);

  const options: { value: GroupingMode; label: string }[] = [
    { value: 'none', label: t`No grouping` },
    { value: GROUP_BY_STATUS, label: t`Group by status` },
    { value: GROUP_BY_TEMPLATE, label: t`Group by template` },
  ];

  const selectedLabel =
    options.find((option) => option.value === groupingMode)?.label ||
    t`No grouping`;

  const handleSelect = (
    _event: React.MouseEvent | undefined,
    value: string | number | undefined
  ) => {
    setIsOpen(false);
    if (value === undefined) return;
    const next = setGroupingMode(
      qsConfig,
      location.search,
      value as GroupingMode
    );
    navigate(next ? `${location.pathname}?${next}` : location.pathname);
  };

  const control = (
    <Select
      id="job-list-group-by"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={handleSelect}
      selected={groupingMode}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
          id="job-list-group-by-toggle"
        >
          {selectedLabel}
        </MenuToggle>
      )}
    >
      <SelectList>
        {options.map((option) => (
          <SelectOption key={option.value} value={option.value}>
            {option.label}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );

  return control;
}

export default GroupBySelect;
