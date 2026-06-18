import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import VisualizerLink from './VisualizerLink';

const link = {
  source: {
    id: 2,
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
};

const dispatch = jest.fn();
const updateHelpText = jest.fn();
const updateLinkHelp = jest.fn();

// The component-under-test is the root <g id="link-2-3"> element; hovering it
// reveals the WorkflowActionTooltip, whose action items render with data-cy
// (and id) of link-add-node / link-edit / link-delete inside a foreignObject.
const renderLink = () =>
  renderWithContexts(
    <WorkflowDispatchContext.Provider value={dispatch}>
      <WorkflowStateContext.Provider value={mockedContext}>
        <svg>
          <VisualizerLink
            link={link}
            readOnly={false}
            updateHelpText={updateHelpText}
            updateLinkHelp={updateLinkHelp}
          />
        </svg>
      </WorkflowStateContext.Provider>
    </WorkflowDispatchContext.Provider>
  );

describe('VisualizerLink', () => {
  let container;
  beforeEach(() => {
    jest.clearAllMocks();
    ({ container } = renderLink());
  });

  const getLinkG = () => container.querySelector('g#link-2-3');
  const getOverlay = () => container.querySelector('#link-2-3-overlay');
  const tooltipItem = (id) => container.querySelector(`[data-cy="${id}"]`);

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
    fireEvent.mouseEnter(tooltipItem('link-add-node'));
    expect(updateHelpText).toHaveBeenCalledWith(
      'Add a new node between these two nodes'
    );
    fireEvent.mouseLeave(tooltipItem('link-add-node'));
    expect(updateHelpText).toHaveBeenCalledWith(null);
    // mouseLeave bubbles to the link <g> and dismisses the tooltip in RTL
    // (enzyme's simulate did not bubble), so re-hover before clicking.
    fireEvent.mouseEnter(getLinkG());
    fireEvent.click(tooltipItem('link-add-node'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'START_ADD_NODE',
      sourceNodeId: 2,
      targetNodeId: 3,
    });
    expect(tooltipItem('link-add-node')).not.toBeInTheDocument();
  });

  test('Edit tooltip action hover/click updates help text and dispatches properly', () => {
    fireEvent.mouseEnter(getLinkG());
    fireEvent.mouseEnter(tooltipItem('link-edit'));
    expect(updateHelpText).toHaveBeenCalledWith('Edit this link');
    fireEvent.mouseLeave(tooltipItem('link-edit'));
    expect(updateHelpText).toHaveBeenCalledWith(null);
    fireEvent.mouseEnter(getLinkG());
    fireEvent.click(tooltipItem('link-edit'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_LINK_TO_EDIT',
      value: link,
    });
    expect(tooltipItem('link-edit')).not.toBeInTheDocument();
  });

  test('Delete tooltip action hover/click updates help text and dispatches properly', () => {
    fireEvent.mouseEnter(getLinkG());
    fireEvent.mouseEnter(tooltipItem('link-delete'));
    expect(updateHelpText).toHaveBeenCalledWith('Delete this link');
    fireEvent.mouseLeave(tooltipItem('link-delete'));
    expect(updateHelpText).toHaveBeenCalledWith(null);
    fireEvent.mouseEnter(getLinkG());
    fireEvent.click(tooltipItem('link-delete'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'START_DELETE_LINK',
      link,
    });
    expect(tooltipItem('link-delete')).not.toBeInTheDocument();
  });
});
