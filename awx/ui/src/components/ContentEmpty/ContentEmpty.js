import React from 'react';
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import {
  Title,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
} from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';

const ContentEmpty = ({
  title = '',
  message = '',
  icon = CubesIcon,
  className = '',
}) => {
  const { i18n } = useLingui();
  return (
    <EmptyState variant="full" className={className}>
      <EmptyStateIcon icon={icon} />
      <Title size="lg" headingLevel="h3">
        {title || i18n._(msg`No items found.`)}
      </Title>
      <EmptyStateBody>{message}</EmptyStateBody>
    </EmptyState>
  );
};

export { ContentEmpty as _ContentEmpty };
export default ContentEmpty;
