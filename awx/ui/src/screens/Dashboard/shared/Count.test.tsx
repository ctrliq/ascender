import React from 'react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import Count from './Count';

describe('<Count />', () => {
  test('initially renders without crashing', () => {
    const { container } = renderWithContexts(<Count link="foo" />);
    expect(container).toBeInTheDocument();
    expect(container.querySelector('h2')).toBeInTheDocument();
  });

  test('renders non-failed version of count without prop', () => {
    const { container } = renderWithContexts(<Count link="foo" />);
    expect(container.querySelector('h2')).not.toHaveClass('failed');
  });

  test('renders failed version of count with appropriate prop', () => {
    const { container } = renderWithContexts(<Count link="foo" failed />);
    expect(container.querySelector('h2')).toHaveClass('failed');
  });
});
