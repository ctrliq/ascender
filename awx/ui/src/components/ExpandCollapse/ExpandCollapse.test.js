import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ExpandCollapse from './ExpandCollapse';

describe('<ExpandCollapse />', () => {
  const onCompact = jest.fn();
  const onExpand = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders without crashing', () => {
    renderWithContexts(
      <ExpandCollapse
        onCompact={onCompact}
        onExpand={onExpand}
        isCompact={false}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Collapse' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
  });

  test('clicking collapse calls onCompact and clicking expand calls onExpand', async () => {
    const { user } = renderWithContexts(
      <ExpandCollapse
        onCompact={onCompact}
        onExpand={onExpand}
        isCompact={false}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(onCompact).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Expand' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
