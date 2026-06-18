import React from 'react';
import { render } from '@testing-library/react';
import omitProps from './omitProps';

// omitProps returns a component that forwards its props (minus the omitted
// ones) to the wrapped element. With a plain 'div' the forwarded props land as
// DOM attributes, so the enzyme `.prop('foo')` checks become attribute checks
// on the rendered node (present attribute === forwarded prop; absent === omitted).
describe('omitProps', () => {
  test('should render child component', () => {
    const Omit = omitProps('div');
    const { container } = render(<Omit foo="one" bar="two" />);

    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div.getAttribute('foo')).toEqual('one');
    expect(div.getAttribute('bar')).toEqual('two');
  });

  test('should not pass omitted props to child component', () => {
    const Omit = omitProps('div', 'foo', 'bar');
    const { container } = render(<Omit foo="one" bar="two" />);

    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div.hasAttribute('foo')).toBe(false);
    expect(div.hasAttribute('bar')).toBe(false);
  });

  test('should support mix of omitted and non-omitted props', () => {
    const Omit = omitProps('div', 'foo');
    const { container } = render(<Omit foo="one" bar="two" />);

    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div.hasAttribute('foo')).toBe(false);
    expect(div.getAttribute('bar')).toEqual('two');
  });
});
