import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { LabelGroup } from '@patternfly/react-core';

function ChipGroup({ numChips, totalChips, ouiaId, ...props }) {
  const { t } = useLingui();
  return (
    <LabelGroup
      {...props}
      {...(ouiaId ? { 'data-ouia-component-id': ouiaId } : {})}
      numLabels={numChips}
      expandedText={t`Show less`}
      collapsedText={t`${totalChips - numChips} more`}
    />
  );
}

export default ChipGroup;
