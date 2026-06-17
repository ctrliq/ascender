import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ActionItem from './ActionItem';

describe('<ActionItem />', () => {
  test('should render child wrapped with tooltip', async () => {
    const { user } = renderWithContexts(
      <ActionItem column={1} tooltip="a tooltip" visible>
        foo
      </ActionItem>
    );

    // when a tooltip is provided, ActionItem wraps the children in a <div>
    // inside a PF Tooltip; the child content is rendered to the DOM
    const child = screen.getByText('foo');
    expect(child).toBeInTheDocument();
    expect(child.tagName).toEqual('DIV');
    // the tooltip content ("a tooltip") is revealed on hover
    await user.hover(child);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('a tooltip');
  });

  test('should render null if not visible', async () => {
    const { container } = renderWithContexts(
      <ActionItem column={1} tooltip="foo">
        <div>foo</div>
      </ActionItem>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('foo')).not.toBeInTheDocument();
  });
});
