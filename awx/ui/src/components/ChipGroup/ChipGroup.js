import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { LabelGroup } from '@patternfly/react-core';

function ChipGroup({ numChips, totalChips, ouiaId, onOverflowChipClick, ...props }) {
  const { t } = useLingui();

  const handleClick = (e) => {
    if (onOverflowChipClick && e.target.closest('.pf-m-overflow')) {
      onOverflowChipClick();
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
