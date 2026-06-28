import React from 'react';
import {
	Title
} from '@patternfly/react-core';
import {
	Modal
} from '@patternfly/react-core/deprecated';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InfoCircleIcon,
  TimesCircleIcon,
} from '@patternfly/react-icons';

import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';

const Header = styled.div`
  display: flex;
  align-items: center;
  svg {
    margin-right: 16px;
    font-size: 1.5rem;
    min-width: 1.5rem;
  }
`;

function AlertModal({
  isOpen = null,
  title,
  label,
  variant,
  children,
  ...props
}) {
  const { t } = useLingui();
  const variantIcons = {
    danger: (
      <ExclamationCircleIcon
        size="xl"
        style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}
      />
    ),
    error: (
      <TimesCircleIcon
        size="xl"
        style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}
      />
    ),
    info: (
      <InfoCircleIcon
        size="xl"
        style={{ color: 'var(--pf-t--global--color--status--info--default)' }}
      />
    ),
    success: (
      <CheckCircleIcon
        size="xl"
        style={{ color: 'var(--pf-t--global--color--status--success--default)' }}
      />
    ),
    warning: (
      <ExclamationTriangleIcon
        size="xl"
        style={{ color: 'var(--pf-t--global--color--status--warning--default)' }}
      />
    ),
  };

  const customHeader = (
    <Header>
      {variant ? variantIcons[variant] : null}
      <Title id="alert-modal-header-label" size="2xl" headingLevel="h2">
        {title}
      </Title>
    </Header>
  );

  return (
    <Modal
      header={customHeader}
      aria-label={label || t`Alert modal`}
      aria-labelledby="alert-modal-header-label"
      isOpen={Boolean(isOpen)}
      variant="small"
      title={title}
      ouiaId="alert-modal"
      {...props}
    >
      {children}
    </Modal>
  );
}

export default AlertModal;
