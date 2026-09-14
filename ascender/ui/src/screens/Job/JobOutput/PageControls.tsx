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
import './PageControls.css';

export interface PageControlsProps {
  onScrollFirst?: () => void;
  onScrollLast?: () => void;
  onScrollNext?: () => void;
  onScrollPrevious?: () => void;
  toggleExpandCollapseAll?: () => void;
  isAllCollapsed?: boolean;
  isFlatMode?: boolean;
  isTemplateJob?: boolean;
  [key: string]: unknown;
}

const PageControls = ({
  onScrollFirst,
  onScrollLast,
  onScrollNext,
  onScrollPrevious,
  toggleExpandCollapseAll,
  isAllCollapsed,
  isFlatMode,
  isTemplateJob,
}: PageControlsProps) => {
  const { t } = useLingui();
  return (
    <div className="awx-page-controls__controlls-wrapper">
      <div className="awx-page-controls__expand-collapse-wrapper">
        {!isFlatMode && isTemplateJob && (
          <Button
            icon={isAllCollapsed ? <AngleRightIcon /> : <AngleDownIcon />}
            aria-label={
              isAllCollapsed ? t`Expand job events` : t`Collapse all job events`
            }
            variant="plain"
            type="button"
            onClick={toggleExpandCollapseAll}
          />
        )}
      </div>
      <div className="awx-page-controls__scroll-wrapper">
        <Button
          icon={<AngleUpIcon />}
          ouiaId="job-output-scroll-previous-button"
          aria-label={t`Scroll previous`}
          onClick={onScrollPrevious}
          variant="plain"
        />
        <Button
          icon={<AngleDownIcon />}
          ouiaId="job-output-scroll-next-button"
          aria-label={t`Scroll next`}
          onClick={onScrollNext}
          variant="plain"
        />
        <Button
          icon={<AngleDoubleUpIcon />}
          ouiaId="job-output-scroll-first-button"
          aria-label={t`Scroll first`}
          onClick={onScrollFirst}
          variant="plain"
        />
        <Button
          icon={<AngleDoubleDownIcon />}
          ouiaId="job-output-scroll-last-button"
          aria-label={t`Scroll last`}
          onClick={onScrollLast}
          variant="plain"
        />
      </div>
    </div>
  );
};

export default PageControls;
