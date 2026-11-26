import React from 'react';
import { render, screen } from '@testing-library/react';
import CardActionsRow from './CardActionsRow';

describe('<CardActionsRow />', () => {
  test('renders the row it is given', () => {
    render(
      <CardActionsRow>
        <button type="button">Edit</button>
      </CardActionsRow>
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  test('renders nothing when every action is gated away', () => {
    // What a detail screen passes when the user may neither edit nor delete.
    const { container } = render(
      <CardActionsRow>
        {false}
        {null}
      </CardActionsRow>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
