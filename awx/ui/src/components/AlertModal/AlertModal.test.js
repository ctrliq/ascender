import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import AlertModal from './AlertModal';

describe('AlertModal', () => {
  test('renders the expected content', () => {
    renderWithContexts(
      <AlertModal isOpen title="Danger!">
        Are you sure?
      </AlertModal>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Danger!')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });
});
