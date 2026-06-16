import React from 'react';
import { render, screen } from '@testing-library/react';

import Detail from './Detail';

describe('Detail', () => {
  test('renders the expected content', () => {
    render(<Detail label="foo" value="bar" />);
    // Detail renders a <dt>label</dt><dd>value</dd> pair.
    const term = screen.getByText('foo');
    expect(term.nextElementSibling).toHaveTextContent('bar');
  });

  test('renders nothing when value is empty and not alwaysVisible', () => {
    const { container } = render(<Detail label="foo" />);
    expect(container).toBeEmptyDOMElement();
  });
});
