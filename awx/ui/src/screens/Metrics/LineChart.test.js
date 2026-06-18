import React from 'react';

import { renderWithContexts } from '../../../testUtils/rtlContexts';
import LineChart from './LineChart';

describe('<LineChart/>', () => {
  test('should render properly', async () => {
    const { container } = renderWithContexts(
      <LineChart
        data={[
          {
            name: 'Instance 1',
            values: [
              { x: 0, y: 10 },
              { x: 1, y: 20 },
              { x: 3, y: 30 },
            ],
          },
          {
            name: 'Instance 1',
            values: [
              { x: 0, y: 40 },
              { x: 1, y: 50 },
              { x: 3, y: 60 },
            ],
          },
        ]}
        helpText="This is the help text"
      />
    );
    // LineChart draws into a #chart container with d3; in jsdom the d3 draw
    // runs but the SVG layout is meaningless, so assert the chart container
    // exists and the help text was rendered into it.
    const chart = container.querySelector('#chart');
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveTextContent('This is the help text');
  });
});
