import React from 'react';
import { useLingui } from '@lingui/react';

import 'styled-components/macro';
import { t } from '@lingui/react/macro';
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
  const { i18n } = useLingui();
  return (
    <ControllsWrapper>
      <ExpandCollapseWrapper>
        {!isFlatMode && isTemplateJob && (
          <Button
            aria-label={
              isAllCollapsed
                ? i18n._(t`Expand job events`)
                : i18n._(t`Collapse all job events`)
            }
            variant="plain"
            type="button"
            onClick={toggleExpandCollapseAll}
          >
            {isAllCollapsed ? <AngleRightIcon /> : <AngleDownIcon />}
          </Button>
        )}
      </ExpandCollapseWrapper>
      <ScrollWrapper>
        <Button
          ouiaId="job-output-scroll-previous-button"
          aria-label={i18n._(t`Scroll previous`)}
          onClick={onScrollPrevious}
          variant="plain"
        >
          <AngleUpIcon />
        </Button>
        <Button
          ouiaId="job-output-scroll-next-button"
          aria-label={i18n._(t`Scroll next`)}
          onClick={onScrollNext}
          variant="plain"
        >
          <AngleDownIcon />
        </Button>
        <Button
          ouiaId="job-output-scroll-first-button"
          aria-label={i18n._(t`Scroll first`)}
          onClick={onScrollFirst}
          variant="plain"
        >
          <AngleDoubleUpIcon />
        </Button>
        <Button
          ouiaId="job-output-scroll-last-button"
          aria-label={i18n._(t`Scroll last`)}
          onClick={onScrollLast}
          variant="plain"
        >
          <AngleDoubleDownIcon />
        </Button>
      </ScrollWrapper>
    </ControllsWrapper>
  );
};

export default PageControls;
