import React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Title,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
} from '@patternfly/react-core';
import { LucideIconBox } from '@ctrliq/quantic-react';

const ContentEmpty = ({
  title = '',
  message = '',
  icon = LucideIconBox,
  className = '',
}) => {
  const { t } = useLingui();
  return (
    <EmptyState variant="full" className={className}>
      <EmptyStateIcon size={64} icon={icon} />
      <Title size="lg" headingLevel="h3">
        {title || t`No items found.`}
      </Title>
      <EmptyStateBody>{message}</EmptyStateBody>
    </EmptyState>
  );
};

export { ContentEmpty as _ContentEmpty };
export default ContentEmpty;
