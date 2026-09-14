import React from 'react';

import './FormLayout.css';

export interface LayoutProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

const join = (...names: (string | false | undefined)[]) =>
  names.filter(Boolean).join(' ');

export interface FormColumnLayoutProps extends LayoutProps {
  /** Stacked drops to a bordered band, which the schedule form uses. */
  $stacked?: boolean;
}

export const FormColumnLayout = ({
  $stacked = false,
  className,
  children,
  ...props
}: FormColumnLayoutProps) => (
  <div
    className={join(
      'ascender-form-column-layout',
      $stacked && 'ascender-form-column-layout--stacked',
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const FormFullWidthLayout = ({
  className,
  children,
  ...props
}: LayoutProps) => (
  <div className={join('ascender-form-full-width-layout', className)} {...props}>
    {children}
  </div>
);

export const FormCheckboxLayout = ({
  className,
  children,
  ...props
}: LayoutProps) => (
  <div className={join('ascender-form-checkbox-layout', className)} {...props}>
    {children}
  </div>
);

export const SubFormLayout = ({
  className,
  children,
  ...props
}: LayoutProps) => (
  <div className={join('ascender-sub-form-layout', className)} {...props}>
    {children}
  </div>
);
