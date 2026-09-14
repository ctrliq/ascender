import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { LabelGroup } from '@patternfly/react-core';

export interface ChipGroupProps {
  /** How many chips to show before the rest collapse behind a count. */
  numChips: number;
  totalChips: number;
  ouiaId?: string;
  onOverflowChipClick?: (event: React.SyntheticEvent) => void;
  [key: string]: unknown;
}

function ChipGroup({
  numChips,
  totalChips,
  ouiaId,
  onOverflowChipClick,
  ...props
}: ChipGroupProps) {
  const { t } = useLingui();

  const handleClick = (e: React.SyntheticEvent) => {
    if (
      onOverflowChipClick &&
      (e.target as HTMLElement).closest('.pf-m-overflow')
    ) {
      onOverflowChipClick(e);
    }
  };

  return (
    /* eslint-disable jsx-a11y/no-static-element-interactions */
    /* eslint-disable jsx-a11y/click-events-have-key-events */
    <div onClick={onOverflowChipClick ? handleClick : undefined}>
      <LabelGroup
        {...props}
        {...(ouiaId ? { 'data-ouia-component-id': ouiaId } : {})}
        numLabels={numChips}
        expandedText={t`Show less`}
        collapsedText={t`${totalChips - numChips} more`}
      />
    </div>
  );
}

export default ChipGroup;
