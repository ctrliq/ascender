import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Wizard from './Wizard';

describe('Wizard', () => {
  test('renders the expected content', () => {
    renderWithContexts(
      <Wizard
        title="Simple Wizard"
        steps={[{ name: 'Step 1', component: <p>Step 1</p> }]}
      />
    );
    // The wizard renders its first step's content (the <p>) plus nav entries
    // that also read "Step 1"; the content paragraph is the unique <p>.
    expect(screen.getByText('Step 1', { selector: 'p' })).toBeInTheDocument();
    // The step's nav button is present and active.
    expect(
      screen.getByRole('button', { name: 'Step 1' })
    ).toBeInTheDocument();
  });
});
