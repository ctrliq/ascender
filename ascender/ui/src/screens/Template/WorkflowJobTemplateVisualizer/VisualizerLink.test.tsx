import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { WorkflowActionTooltip } from 'components/Workflow';
import { getLinePoints } from 'components/Workflow/WorkflowUtils';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import VisualizerLink from './VisualizerLink';
import type {
  WorkflowLink,
  WorkflowState,
} from '../../../components/Workflow/workflowReducer';

// The real menu, watched, so a test can see where each drawing of it stood.
vi.mock('components/Workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('components/Workflow')>();
  return {
    ...actual,
    WorkflowActionTooltip: vi.fn(actual.WorkflowActionTooltip),
  };
});

const link = {
  source: {
    id: 2,
  },
  target: {
    id: 3,
  },
  linkType: 'success',
};

/** A second link, to watch what one link's menu does when the other opens. */
const otherLink = {
  source: {
    id: 1,
  },
  target: {
    id: 3,
  },
  linkType: 'success',
};

const mockedContext = {
  addingLink: false,
  nodePositions: {
    1: {
      width: 72,
      height: 40,
      x: 0,
      y: 0,
    },
    2: {
      width: 180,
      height: 60,
      x: 282,
      y: 40,
    },
    3: {
      width: 180,
      height: 60,
      x: 564,
      y: 40,
    },
  },
} as unknown as WorkflowState;

const dispatch = vi.fn();
const updateHelpText = vi.fn();
const updateLinkHelp = vi.fn();

// The component-under-test is the root <g id="link-2-3"> element; hovering it
// reveals the WorkflowActionTooltip, whose action items render with data-cy
// (and id) of link-add-node / link-edit / link-delete inside a foreignObject.
//
// A link no longer holds whether it is hovered: it asks to be raised and the
// graph hands that back down, so that only one link can be open at a time. This
// stands in for the graph, which is what makes the hover round trip.
function LinkUnderGraph({ links = [link] }: { links?: unknown[] }) {
  const [raised, setRaised] = React.useState<WorkflowLink | null>(null);
  return (
    <svg>
      {(links as WorkflowLink[]).map((each) => (
        <VisualizerLink
          key={`link-${each.source.id}-${each.target.id}`}
          link={each}
          readOnly={false}
          onRaise={setRaised}
          updateHelpText={updateHelpText}
          updateLinkHelp={updateLinkHelp}
        />
      ))}
      {/* The graph draws the open menu in a pass of its own, after the nodes. */}
      {raised && (
        <VisualizerLink
          key={`link-${raised.source.id}-${raised.target.id}-menu`}
          link={raised}
          readOnly={false}
          isHovered
          isMenuLayer
          onRaise={setRaised}
          updateHelpText={updateHelpText}
          updateLinkHelp={updateLinkHelp}
        />
      )}
    </svg>
  );
}

const renderLink = () =>
  renderWithContexts(
    <WorkflowDispatchContext.Provider value={dispatch}>
      <WorkflowStateContext.Provider value={mockedContext}>
        <LinkUnderGraph />
      </WorkflowStateContext.Provider>
    </WorkflowDispatchContext.Provider>
  );

describe('VisualizerLink', () => {
  let container: HTMLElement;
  beforeEach(() => {
    vi.clearAllMocks();
    ({ container } = renderLink());
  });

  const getLinkG = () => container.querySelector('g#link-2-3') as Element;
  const getOverlay = () =>
    container.querySelector('#link-2-3-overlay') as Element;
  // Nullable on purpose: half these assertions are that it is not there.
  const tooltipItem = (id: string) =>
    container.querySelector(`[data-cy="${id}"]`);
  /** The same item, where the test has just asserted it is on screen. */
  const shownTooltipItem = (id: string) => tooltipItem(id) as Element;

  test('Displays action tooltip on hover and updates help text on hover', () => {
    expect(tooltipItem('link-add-node')).not.toBeInTheDocument();
    fireEvent.mouseEnter(getLinkG());
    expect(tooltipItem('link-add-node')).toBeInTheDocument();
    expect(tooltipItem('link-edit')).toBeInTheDocument();
    expect(tooltipItem('link-delete')).toBeInTheDocument();
    fireEvent.mouseLeave(getLinkG());
    expect(tooltipItem('link-add-node')).not.toBeInTheDocument();
    fireEvent.mouseEnter(getOverlay());
    expect(updateLinkHelp).toHaveBeenCalledWith(link);
    fireEvent.mouseLeave(getOverlay());
    expect(updateLinkHelp).toHaveBeenCalledWith(null);
  });

  test('Add Node tooltip action hover/click updates help text and dispatches properly', () => {
    fireEvent.mouseEnter(getLinkG());
    fireEvent.mouseEnter(shownTooltipItem('link-add-node'));
    expect(updateHelpText).toHaveBeenCalledWith('Add Node Between');
    fireEvent.mouseLeave(shownTooltipItem('link-add-node'));
    expect(updateHelpText).toHaveBeenCalledWith(null);
    // mouseLeave bubbles to the link <g> and dismisses the tooltip in RTL,
    // so re-hover before clicking.
    fireEvent.mouseEnter(getLinkG());
    fireEvent.click(shownTooltipItem('link-add-node'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'START_ADD_NODE',
      sourceNodeId: 2,
      targetNodeId: 3,
    });
    expect(tooltipItem('link-add-node')).not.toBeInTheDocument();
  });

  test('Edit tooltip action hover/click updates help text and dispatches properly', () => {
    fireEvent.mouseEnter(getLinkG());
    fireEvent.mouseEnter(shownTooltipItem('link-edit'));
    expect(updateHelpText).toHaveBeenCalledWith('Edit Link');
    fireEvent.mouseLeave(shownTooltipItem('link-edit'));
    expect(updateHelpText).toHaveBeenCalledWith(null);
    fireEvent.mouseEnter(getLinkG());
    fireEvent.click(shownTooltipItem('link-edit'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_LINK_TO_EDIT',
      value: link,
    });
    expect(tooltipItem('link-edit')).not.toBeInTheDocument();
  });

  test('Delete tooltip action hover/click updates help text and dispatches properly', () => {
    fireEvent.mouseEnter(getLinkG());
    fireEvent.mouseEnter(shownTooltipItem('link-delete'));
    expect(updateHelpText).toHaveBeenCalledWith('Delete Link');
    fireEvent.mouseLeave(shownTooltipItem('link-delete'));
    expect(updateHelpText).toHaveBeenCalledWith(null);
    fireEvent.mouseEnter(getLinkG());
    fireEvent.click(shownTooltipItem('link-delete'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'START_DELETE_LINK',
      link,
    });
    expect(tooltipItem('link-delete')).not.toBeInTheDocument();
  });

  /*
   * The menu belongs to whichever link the pointer is on, and to one at a time.
   * Held in each link, a link that never saw the pointer leave kept its menu
   * open underneath the neighbour that had just opened its own.
   */
  test('only the link under the pointer keeps its menu', () => {
    const two = renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={mockedContext}>
          <LinkUnderGraph links={[link, otherLink]} />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    const first = two.container.querySelector('g#link-2-3') as Element;
    const second = two.container.querySelector('g#link-1-3') as Element;

    // The menu is drawn in a pass of its own, so which link it belongs to is
    // the group it is drawn in rather than the group the line is in.
    const openMenus = () =>
      [...two.container.querySelectorAll('[data-cy="link-add-node"]')].map(
        (item) => item.closest('g[id$="-menu"]')?.id
      );

    fireEvent.mouseEnter(first);
    expect(openMenus()).toEqual(['link-2-3-menu']);

    // The pointer reaches the second link without the first seeing it leave,
    // which is what happens when the first link's own menu covers the second.
    fireEvent.mouseEnter(second);
    expect(openMenus()).toEqual(['link-1-3-menu']);
  });

  /*
   * The menu is anchored at the middle of its line from the first time it is
   * drawn. Worked out in an effect, the first drawing stood at 0,0, the
   * corner of the graph, for a frame before the effect moved it.
   */
  test('draws the menu at the middle of its line the first time', () => {
    vi.mocked(WorkflowActionTooltip).mockClear();
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider value={mockedContext}>
          <svg>
            <VisualizerLink
              link={link as unknown as WorkflowLink}
              readOnly={false}
              isHovered
              isMenuLayer
              updateHelpText={updateHelpText}
              updateLinkHelp={updateLinkHelp}
            />
          </svg>
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );

    const [from, to] = getLinePoints(
      link as unknown as WorkflowLink,
      (mockedContext as unknown as { nodePositions: never }).nodePositions
    );
    const [firstDrawing] = vi.mocked(WorkflowActionTooltip).mock.calls[0]!;
    expect(firstDrawing.pointX).toBe((from.x + to.x) / 2);
    expect(firstDrawing.pointY).toBe((from.y + to.y) / 2);
  });
});
