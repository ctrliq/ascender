import React from 'react';
import { CardBody } from '@patternfly/react-core';

import './CardBody.css';

CardBody.displayName = 'PFCardBody';

export interface TabbedCardBodyProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

/** A card body under a tab bar, which gets the padding the first child would. */
const TabbedCardBody = ({
  className,
  children,
  ...props
}: TabbedCardBodyProps) => (
  <CardBody
    className={['awx-card-body__tabbed', className].filter(Boolean).join(' ')}
    {...props}
  >
    {children}
  </CardBody>
);

export default TabbedCardBody;
