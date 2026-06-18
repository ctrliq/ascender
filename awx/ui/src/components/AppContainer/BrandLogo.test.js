import React from 'react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import BrandLogo from './BrandLogo';

describe('<BrandLogo />', () => {
  test('initially renders without crashing', () => {
    const { container } = renderWithContexts(<BrandLogo alt="brand logo" />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'brand logo');
  });
});
