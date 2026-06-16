import React from 'react';
import { render, screen } from '@testing-library/react';

import DetailList from './DetailList';
import Detail from './Detail';

describe('DetailList', () => {
  test('renders the expected content', () => {
    render(
      <DetailList>
        <Detail label="foo" value="bar" />
      </DetailList>
    );
    const term = screen.getByText('foo');
    expect(term.nextElementSibling).toHaveTextContent('bar');
  });
});
