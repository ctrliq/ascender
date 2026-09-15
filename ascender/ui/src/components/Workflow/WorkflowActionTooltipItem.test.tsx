import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkflowActionTooltipItem from './WorkflowActionTooltipItem';

describe('WorkflowActionTooltipItem', () => {
  test('successfully mounts', () => {
    const { container } = render(
      <WorkflowActionTooltipItem label="Probe action" id="node" />
    );
    expect(container.querySelector('#node')).toBeInTheDocument();
  });

  // It was a <div> with an onClick: no keyboard, and nothing to announce. The
  // lint rules that say so could not see it through the styled component it
  // used to be, which is how it stayed that way.
  test('is a button, named by what it does', () => {
    render(<WorkflowActionTooltipItem label="Delete this node" id="node" />);

    expect(
      screen.getByRole('button', { name: 'Delete this node' })
    ).toBeInTheDocument();
  });

  test('can be reached and fired from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <WorkflowActionTooltipItem
        label="Add a new node"
        id="node"
        onClick={onClick}
      />
    );

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Add a new node' })
    ).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('shows its help text on focus, as it does on hover', async () => {
    const user = userEvent.setup();
    const onMouseEnter = vi.fn();
    const onMouseLeave = vi.fn();
    render(
      <>
        <WorkflowActionTooltipItem
          label="Edit this node"
          id="node"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
        <button type="button">elsewhere</button>
      </>
    );

    await user.tab();
    expect(onMouseEnter).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(onMouseLeave).toHaveBeenCalledTimes(1);
  });
});
