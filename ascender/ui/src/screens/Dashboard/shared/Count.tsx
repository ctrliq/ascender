import React from 'react';
import { Link } from 'react-router';
import { Card } from '@patternfly/react-core';
import './Count.css';

export interface CountProps {
  /** Styles the count as a failure figure rather than a total. */
  failed?: boolean;
  link: string;
  /** The figure itself, absent while the dashboard is still loading. */
  data?: number;
  label?: React.ReactNode;
}

function Count({ failed, link, data, label }: CountProps) {
  return (
    <Link className="ascender-count__link" to={link}>
      <Card className="ascender-count__card" isClickable>
        <h2 className={failed ? 'failed' : undefined}>{data || 0}</h2>
        {label}
      </Card>
    </Link>
  );
}

export default Count;
