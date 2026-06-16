import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ActivityStream from './ActivityStream';

jest.mock('../../api');

describe('<ActivityStream />', () => {
  test('initially renders without crashing', async () => {
    renderWithContexts(<ActivityStream />);
    expect(
      await screen.findByRole('heading', { name: 'Activity Stream' })
    ).toBeInTheDocument();
  });
});
