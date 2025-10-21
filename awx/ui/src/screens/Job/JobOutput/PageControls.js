import React from 'react';
import { useLingui } from '@lingui/react/macro';

import 'styled-components/macro';
import { Button } from '@patternfly/react-core';
import {
  LucideIconChevronsUp,
  LucideIconChevronsDown,
  LucideIconChevronUp,
  LucideIconChevronDown,
  LucideIconChevronRight,
} from '@ctrliq/quantic-react';
import styled from 'styled-components';

const ControllsWrapper = styled.div`
  display: flex;
  height: 35px;
  border: 1px solid #d7d7d7;
  width: 100%;
  justify-content: space-between;
`;

const ScrollWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
`;
const ExpandCollapseWrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  & > Button {
    padding-left: 8px;
  }
`;

const PageControls = ({
  onScrollFirst,
  onScrollLast,
  onScrollNext,
  onScrollPrevious,
  toggleExpandCollapseAll,
  isAllCollapsed,
  isFlatMode,
  isTemplateJob,
}) => {
  const { t } = useLingui();
  return (
    <ControllsWrapper>
      <ExpandCollapseWrapper>
        {!isFlatMode && isTemplateJob && (
          <Button
            aria-label={
              isAllCollapsed ? t`Expand job events` : t`Collapse all job events`
            }
            variant="plain"
            type="button"
            onClick={toggleExpandCollapseAll}
          >
            {isAllCollapsed ? (
              <LucideIconChevronRight
                data-original-icon="AngleRightIcon"
                size={16}
              />
            ) : (
              <LucideIconChevronDown
                data-original-icon="AngleDownIcon"
                size={16}
              />
            )}
          </Button>
        )}
      </ExpandCollapseWrapper>
      <ScrollWrapper>
        <Button
          ouiaId="job-output-scroll-previous-button"
          aria-label={t`Scroll previous`}
          onClick={onScrollPrevious}
          variant="plain"
        >
          <LucideIconChevronUp data-original-icon="AngleUpIcon" size={16} />
        </Button>
        <Button
          ouiaId="job-output-scroll-next-button"
          aria-label={t`Scroll next`}
          onClick={onScrollNext}
          variant="plain"
        >
          <LucideIconChevronDown data-original-icon="AngleDownIcon" size={16} />
        </Button>
        <Button
          ouiaId="job-output-scroll-first-button"
          aria-label={t`Scroll first`}
          onClick={onScrollFirst}
          variant="plain"
        >
          <LucideIconChevronsUp
            data-original-icon="AngleDoubleUpIcon"
            size={16}
          />
        </Button>
        <Button
          ouiaId="job-output-scroll-last-button"
          aria-label={t`Scroll last`}
          onClick={onScrollLast}
          variant="plain"
        >
          <LucideIconChevronsDown
            data-original-icon="AngleDoubleDownIcon"
            size={16}
          />
        </Button>
      </ScrollWrapper>
    </ControllsWrapper>
  );
};

export default PageControls;
