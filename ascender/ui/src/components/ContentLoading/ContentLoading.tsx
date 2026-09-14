import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { EmptyState as PFEmptyState, Skeleton } from '@patternfly/react-core';
import './ContentLoading.css';

export interface ContentLoadingProps {
  className?: string;
  [key: string]: unknown;
}

const ContentLoading = ({ className }: ContentLoadingProps) => {
  const { t } = useLingui();
  return (
    <PFEmptyState
      variant="full"
      className={`awx-content-loading__empty-state ${className}`}
    >
      {/* indeterminate progressbar: the same accessible contract as the
          spinner this replaces */}
      <div
        className="awx-content-loading__skeleton-stack"
        role="progressbar"
        aria-label={t`Loading`}
      >
        <Skeleton width="80%" fontSize="md" />
        <Skeleton width="100%" fontSize="md" />
        <Skeleton width="60%" fontSize="md" />
        <Skeleton width="90%" fontSize="md" />
      </div>
    </PFEmptyState>
  );
};

export { ContentLoading as _ContentLoading };
export default ContentLoading;
