import React from 'react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import JobEventSkeleton from './JobEventSkeleton';

describe('<JobEvenSkeleton />', () => {
  test('initially renders successfully', () => {
    const { container } = renderWithContexts(
      <JobEventSkeleton measure={jest.fn()} contentLength={80} counter={100} />
    );
    expect(container.querySelectorAll('span.content')).toHaveLength(1);
  });

  test('always skips first counter', () => {
    const { container } = renderWithContexts(
      <JobEventSkeleton measure={jest.fn()} contentLength={80} counter={1} />
    );
    expect(container.querySelectorAll('span.content')).toHaveLength(0);
  });
});
