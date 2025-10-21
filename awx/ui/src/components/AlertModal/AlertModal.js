import 'styled-components/macro';
import React from 'react';
import { Modal, Title } from '@patternfly/react-core';
import {
  LucideIconCircleCheck,
  LucideIconCircleAlert,
  LucideIconTriangleAlert,
  LucideIconInfo,
  LucideIconCircleX,
} from '@ctrliq/quantic-react';

import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';

const Header = styled.div`
  display: flex;
  svg {
    margin-right: 16px;
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
      <LucideIconCircleAlert
        size="lg"
        css="color: var(--pf-global--danger-color--100)"
        data-original-icon="ExclamationCircleIcon"
      />
    ),
    error: (
      <LucideIconCircleX
        size="lg"
        css="color: var(--pf-global--danger-color--100)"
        data-original-icon="TimesCircleIcon"
      />
    ),
    info: (
      <LucideIconInfo
        size="lg"
        css="color: var(--pf-global--info-color--100)"
        data-original-icon="InfoCircleIcon"
      />
    ),
    success: (
      <LucideIconCircleCheck
        size="lg"
        css="color: var(--pf-global--success-color--100)"
        data-original-icon="CheckCircleIcon"
      />
    ),
    warning: (
      <LucideIconTriangleAlert
        size="lg"
        css="color: var(--pf-global--warning-color--100)"
        data-original-icon="ExclamationTriangleIcon"
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
