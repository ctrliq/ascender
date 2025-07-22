import React from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { ChipGroup as PFChipGroup } from '@patternfly/react-core';
import { number } from 'prop-types';

function ChipGroup({ numChips, totalChips, ...props }) {
  const { i18n } = useLingui();
  return (
    <PFChipGroup
      {...props}
      numChips={numChips}
      expandedText={i18n._(msg`Show less`)}
      collapsedText={i18n._(msg`${totalChips - numChips} more`)}
    />
  );
}

ChipGroup.propTypes = {
  numChips: number.isRequired,
  totalChips: number.isRequired,
};

export default ChipGroup;
