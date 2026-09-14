import React from 'react';
import { useLingui } from '@lingui/react/macro';

import {
  EmptyState as PFEmptyState,
  Progress,
  ProgressMeasureLocation,
  Content,
  ContentVariants,
} from '@patternfly/react-core';

import { TopologyIcon as PFTopologyIcon } from '@patternfly/react-icons';
import './ContentLoading.css';

export interface ContentLoadingProps {
  className: string;
  /** How far the force simulation has settled, as a percentage. */
  progress?: number | null;
  [key: string]: unknown;
}

const ContentLoading = ({ className, progress }: ContentLoadingProps) => {
  const { t } = useLingui();
  return (
    <PFEmptyState
      variant="full"
      className={`ascender-topology-content-loading__empty-state ${className}`}
      data-cy={className}
    >
      <PFTopologyIcon className="ascender-topology-content-loading__topology-icon" />
      <Progress
        value={progress ?? 0}
        measureLocation={ProgressMeasureLocation.inside}
        aria-label={t`content-loading-in-progress`}
        style={{ margin: '20px' }}
      />
      <Content style={{ margin: '20px' }}>
        <Content
          component={ContentVariants.small}
          style={{
            fontWeight: 'bold',
            color: 'var(--pf-t--global--text--color--100)',
          }}
        >
          {t`Please wait until the topology view is populated...`}
        </Content>
      </Content>
    </PFEmptyState>
  );
};

export default ContentLoading;
