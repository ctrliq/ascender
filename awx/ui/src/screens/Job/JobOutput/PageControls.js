import React from 'react';
import { useLingui } from '@lingui/react/macro';

import { Button } from '@patternfly/react-core';
import {
  AngleDoubleUpIcon,
  AngleDoubleDownIcon,
  AngleUpIcon,
  AngleDownIcon,
  AngleRightIcon,
} from '@patternfly/react-icons';
import styled from 'styled-components';

const ControllsWrapper = styled.div`
  display: flex;
  height: 35px;
  border: 1px solid var(--pf-v6-global--BorderColor--100);
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
          <Button icon={isAllCollapsed ? <AngleRightIcon /> : <AngleDownIcon />}
            aria-label={
              isAllCollapsed
                ? t`Expand job events`
                : t`Collapse all job events`
            }
            variant="plain"
            type="button"
            onClick={toggleExpandCollapseAll}
           />
        )}
      </ExpandCollapseWrapper>
      <ScrollWrapper>
        <Button icon={<AngleUpIcon />}
          ouiaId="job-output-scroll-previous-button"
          aria-label={t`Scroll previous`}
          onClick={onScrollPrevious}
          variant="plain"
         />
        <Button icon={<AngleDownIcon />}
          ouiaId="job-output-scroll-next-button"
          aria-label={t`Scroll next`}
          onClick={onScrollNext}
          variant="plain"
         />
        <Button icon={<AngleDoubleUpIcon />}
          ouiaId="job-output-scroll-first-button"
          aria-label={t`Scroll first`}
          onClick={onScrollFirst}
          variant="plain"
         />
        <Button icon={<AngleDoubleDownIcon />}
          ouiaId="job-output-scroll-last-button"
          aria-label={t`Scroll last`}
          onClick={onScrollLast}
          variant="plain"
         />
      </ScrollWrapper>
    </ControllsWrapper>
  );
};

export default PageControls;
