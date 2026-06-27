import React from 'react';

import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import { EmptyState as PFEmptyState, Skeleton } from '@patternfly/react-core';

const EmptyState = styled(PFEmptyState)`
  --pf-v6-c-empty-state--m-lg--MaxWidth: none;
  min-height: 250px;
`;

const SkeletonStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--pf-v6-global--spacer--md);
  text-align: left;
  width: 100%;
`;

const ContentLoading = ({ className }) => {
  const { t } = useLingui();
  return (
    <EmptyState variant="full" className={className}>
      {/* indeterminate progressbar: the same accessible contract as the
          spinner this replaces */}
      <SkeletonStack role="progressbar" aria-label={t`Loading`}>
        <Skeleton width="80%" fontSize="md" />
        <Skeleton width="100%" fontSize="md" />
        <Skeleton width="60%" fontSize="md" />
        <Skeleton width="90%" fontSize="md" />
      </SkeletonStack>
    </EmptyState>
  );
};

export { ContentLoading as _ContentLoading };
export default ContentLoading;
