import React from 'react';
import { screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';

import Detail from './Detail';

describe('Detail', () => {
  test('renders the expected content', () => {
    renderWithContexts(<Detail label="foo" value="bar" />);
    // Detail renders a <dt>label</dt><dd>value</dd> pair.
    assertDetail('foo', 'bar');
  });

  test('renders nothing when value is empty and not alwaysVisible', () => {
    renderWithContexts(<Detail label="foo" value="" />);
    expect(screen.queryByText('foo')).not.toBeInTheDocument();
  });
});
