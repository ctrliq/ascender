import React from 'react';
import { useLingui } from '@lingui/react/macro';

import styled from 'styled-components';
import {
  EmptyState as PFEmptyState,
  Progress,
  ProgressMeasureLocation,
  Content,
  ContentVariants,
} from '@patternfly/react-core';

import { TopologyIcon as PFTopologyIcon } from '@patternfly/react-icons';

const EmptyState = styled(PFEmptyState)`
  --pf-v6-c-empty-state--m-lg--MaxWidth: none;
  min-height: 250px;
`;

const TopologyIcon = styled(PFTopologyIcon)`
  font-size: 3em;
  fill: var(--pf-v6-global--Color--200);
`;

const ContentLoading = ({ className, progress }) => {
  const { t } = useLingui();
  return (
    <EmptyState variant="full" className={className} data-cy={className}>
      <TopologyIcon />
      <Progress
        value={progress}
        measureLocation={ProgressMeasureLocation.inside}
        aria-label={t`content-loading-in-progress`}
        style={{ margin: '20px' }}
      />
      <Content style={{ margin: '20px' }}>
        <Content
          component={ContentVariants.small}
          style={{ fontWeight: 'bold', color: "var(--pf-t--global--text--color--100)" }}
        >
          {t`Please wait until the topology view is populated...`}
        </Content>
      </Content>
    </EmptyState>
  );
};

export default ContentLoading;
