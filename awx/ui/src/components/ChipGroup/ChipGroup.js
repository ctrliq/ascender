import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { ChipGroup as PFChipGroup } from '@patternfly/react-core';

function ChipGroup({ numChips, totalChips, ...props }) {
  const { t } = useLingui();
  return (
    <PFChipGroup
      {...props}
      numChips={numChips}
      expandedText={t`Show less`}
      collapsedText={t`${totalChips - numChips} more`}
    />
  );
}

export default ChipGroup;
