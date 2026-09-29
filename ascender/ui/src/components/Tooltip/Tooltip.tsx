import React from 'react';
import { Tooltip as PFTooltip } from '@patternfly/react-core';
import type { TooltipProps as PFTooltipProps } from '@patternfly/react-core';

/**
 * PatternFly asks for the position it was given and then, with no room there,
 * walks its default list of top, right, bottom, left. A trigger against the
 * right edge of a wide row has no room above centred on itself, so the label
 * lands beside the button and reads differently to every other tooltip on the
 * screen. Offering the two top alignments instead keeps it above and slides it
 * along until it fits.
 */
export const TOP_FLIP: ('top' | 'top-start' | 'top-end')[] = [
  'top',
  'top-start',
  'top-end',
];

/**
 * A tooltip that opens above its trigger, which is where every tooltip in
 * Ascender belongs.
 *
 * A caller that names a position gets it, for the few triggers with nothing
 * above them to open into: the masthead, and the toolbars pinned to the top of
 * the workflow canvas. Everything else takes the top and the flip list with it.
 */
function Tooltip({ position = 'top', flipBehavior, ...rest }: PFTooltipProps) {
  return (
    <PFTooltip
      position={position}
      flipBehavior={flipBehavior ?? (position === 'top' ? TOP_FLIP : undefined)}
      {...rest}
    />
  );
}

export default Tooltip;
