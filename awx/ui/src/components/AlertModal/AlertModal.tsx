import React from 'react';
import { Title } from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InfoCircleIcon,
  TimesCircleIcon,
} from '@patternfly/react-icons';

import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';

// The svg rule below is what sizes these icons. PatternFly 6 dropped the
// size prop from SVGIconProps, so the size="xl" that used to sit on each of
// them was being ignored and is gone.
const Header = styled.div`
  display: flex;
  align-items: center;
  svg {
    margin-right: 16px;
    font-size: 1.5rem;
    min-width: 1.5rem;
  }
`;

/** The variants this modal knows how to badge, matching PatternFly's. */
export type AlertVariant = 'danger' | 'error' | 'info' | 'success' | 'warning';

export interface AlertModalProps {
  isOpen?: boolean | null;
  title?: React.ReactNode;
  label?: string;
  variant?: AlertVariant;
  children?: React.ReactNode;
  onClose?: () => void;
  actions?: React.ReactNode[];
  ouiaId?: string;
  [key: string]: unknown;
}

function AlertModal({
  isOpen = null,
  title,
  label,
  variant,
  children,
  ...props
}: AlertModalProps) {
  const { t } = useLingui();
  const variantIcons = {
    danger: (
      <ExclamationCircleIcon
        style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}
      />
    ),
    error: (
      <TimesCircleIcon
        style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}
      />
    ),
    info: (
      <InfoCircleIcon
        style={{ color: 'var(--pf-t--global--color--status--info--default)' }}
      />
    ),
    success: (
      <CheckCircleIcon
        style={{
          color: 'var(--pf-t--global--color--status--success--default)',
        }}
      />
    ),
    warning: (
      <ExclamationTriangleIcon
        style={{
          color: 'var(--pf-t--global--color--status--warning--default)',
        }}
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
