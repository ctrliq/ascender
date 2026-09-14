import React from 'react';

import Popover from '../Popover';
import './DetailList.css';

/** Join the class names that are actually set, the way styled-components did. */
export const classes = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

export interface DetailNameProps {
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export const DetailName = ({
  fullWidth = false,
  className,
  children,
  ...props
}: DetailNameProps) => (
  <dt
    className={classes(
      'awx-detail-name',
      fullWidth && 'awx-detail-name--full-width',
      className
    )}
    {...props}
  >
    {children}
  </dt>
);

export interface DetailValueProps {
  fullWidth?: boolean;
  isEncrypted?: boolean;
  isNotConfigured?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export const DetailValue = ({
  fullWidth = false,
  isEncrypted = false,
  isNotConfigured = false,
  className,
  children,
  ...props
}: DetailValueProps) => (
  <dd
    className={classes(
      'awx-detail-value',
      fullWidth && 'awx-detail-value--full-width',
      (isEncrypted || isNotConfigured) && 'awx-detail-value--muted',
      className
    )}
    {...props}
  >
    {children}
  </dd>
);

export interface DetailProps {
  label: React.ReactNode;
  value?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  dataCy?: string;
  alwaysVisible?: boolean;
  isEmpty?: boolean;
  helpText?: React.ReactNode;
  isEncrypted?: boolean;
  isNotConfigured?: boolean;
  [key: string]: unknown;
}

const Detail = ({
  label,
  value,
  fullWidth = false,
  className,
  dataCy,
  alwaysVisible = false,
  isEmpty,
  helpText,
  isEncrypted,
  isNotConfigured,
}: DetailProps) => {
  if (!value && typeof value !== 'number' && !alwaysVisible) {
    return null;
  }

  if (isEmpty && !alwaysVisible) {
    return null;
  }

  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;

  return (
    <div>
      <DetailName
        className={className}
        fullWidth={fullWidth}
        data-cy={labelCy}
        id={dataCy}
      >
        {label}
        {helpText && <Popover header={label} content={helpText} id={dataCy} />}
      </DetailName>
      <DetailValue
        className={className}
        fullWidth={fullWidth}
        data-cy={valueCy}
        isEncrypted={isEncrypted}
        isNotConfigured={isNotConfigured}
      >
        {value}
      </DetailValue>
    </div>
  );
};
export default Detail;
