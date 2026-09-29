import React from 'react';
import Tooltip from '../Tooltip';

export interface ActionItemProps {
  tooltip?: React.ReactNode;
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
        /*
         * PatternFly asks for the top and then, with no room there, walks its
         * default list of top, right, bottom, left. The last action in a row
         * sits against the right edge of the table, where a long label has no
         * room above centred on its trigger and ends up beside the button,
         * reading differently to every other action in the same row. Offering
         * the two top alignments instead keeps it above and slides it along.
         */
        <Tooltip
          content={tooltip}
          position="top"
          flipBehavior={['top', 'top-start', 'top-end']}
        >
          <div>{children}</div>
        </Tooltip>
      ) : (
        children
      )}
    </div>
  );
}
