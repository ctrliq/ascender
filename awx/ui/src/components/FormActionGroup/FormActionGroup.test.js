import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import FormActionGroup from './FormActionGroup';

describe('FormActionGroup', () => {
  test('should render save and cancel buttons and invoke their handlers', async () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const { user } = renderWithContexts(
      <FormActionGroup onSubmit={onSubmit} onCancel={onCancel} />
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
