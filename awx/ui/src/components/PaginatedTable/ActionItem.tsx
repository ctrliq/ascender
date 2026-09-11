import type { Untyped } from 'types/api';
import React from 'react';
import { Tooltip } from '@patternfly/react-core';

export interface ActionItemProps {
  tooltip?: Untyped;
  visible?: unknown;
  children: React.ReactNode;
  [key: string]: unknown;
}

export default function ActionItem({
  tooltip,
  visible,
  children,
}: ActionItemProps) {
  if (!visible) {
    return null;
  }

  return (
    <div>
      {tooltip ? (
        <Tooltip content={tooltip} position="top">
          <div>{children}</div>
        </Tooltip>
      ) : (
        children
      )}
    </div>
  );
}
