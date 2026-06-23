import React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody, EmptyStateHeader,
} from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';

const ContentEmpty = ({
  title = '',
  message = '',
  icon = CubesIcon,
  className = '',
}) => {
  const { t } = useLingui();
  return (
    <EmptyState variant="full" className={className}>
      <EmptyStateHeader titleText={<>{title || t`No items found.`}</>} icon={<EmptyStateIcon icon={icon} />} headingLevel="h3" />
      <EmptyStateBody>{message}</EmptyStateBody>
    </EmptyState>
  );
};

export { ContentEmpty as _ContentEmpty };
export default ContentEmpty;
