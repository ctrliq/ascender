import React from 'react';
import { Tooltip } from '@patternfly/react-core';

export default function ActionItem({ tooltip, visible, children }) {
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
