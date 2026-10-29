import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { render } from '@testing-library/react';
import WorkflowActionTooltip from './WorkflowActionTooltip';

const stylesheet = fs.readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'WorkflowActionTooltip.css'
  ),
  'utf8'
);

/**
 * What a rule in the stylesheet declares for a property.
 *
 * Args:
 *     selector: The selector to read, as it is written in the file.
 *     property: The property to read out of that rule.
 *
 * Returns:
 *     The declared value, or null when the rule or the property is not there.
 */
function declared(selector: string, property: string): string | null {
  const rule = stylesheet
    .split('}')
    .find((block) => block.split('{')[0]?.includes(selector));
  const match = rule?.match(new RegExp(`${property}:\\s*([^;]+);`));
  return match ? (match[1] as string).trim() : null;
}

describe('WorkflowActionTooltip', () => {
  test('successfully mounts', () => {
    const { container } = render(
      <svg>
        <WorkflowActionTooltip actions={[]} pointX={0} pointY={0} />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toBeInTheDocument();
  });
  /*
   * The menu's box is bigger than anything drawn in it, and on a link it hangs
   * over the neighbouring lines: taking the pointer there meant the hovered
   * link never saw it leave, so its menu stayed open and the neighbour's never
   * opened. Only the parts that are drawn take the pointer now.
   *
   * jsdom lays nothing out and hit-tests nothing, so what the stylesheet says
   * is the only thing a test here can hold on to. The class below is the hook
   * it hangs on, which is why the markup is asserted with it.
   */
  test('takes the pointer only where the menu is drawn', () => {
    const { container } = render(
      <svg>
        <WorkflowActionTooltip actions={[]} pointX={0} pointY={0} />
      </svg>
    );
    expect(
      container.querySelector('foreignObject.ascender-workflow-action-tooltip')
    ).toBeInTheDocument();

    expect(
      declared('.ascender-workflow-action-tooltip,', 'pointer-events')
    ).toBe('none');
    expect(
      declared('.ascender-workflow-action-tooltip__actions', 'pointer-events')
    ).toBe('auto');
  });
});
