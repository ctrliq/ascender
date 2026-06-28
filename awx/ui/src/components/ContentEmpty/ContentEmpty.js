import React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  EmptyState,
  EmptyStateBody, } from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';

const ContentEmpty = ({
  title = '',
  message = '',
  icon = CubesIcon,
  className = '',
}) => {
  const { t } = useLingui();
  return (
    <EmptyState  headingLevel="h3" icon={icon}  titleText={<>{title || t`No items found.`}</>} variant="full" className={className}>
      <EmptyStateBody>{message}</EmptyStateBody>
    </EmptyState>
  );
};

export { ContentEmpty as _ContentEmpty };
export default ContentEmpty;
