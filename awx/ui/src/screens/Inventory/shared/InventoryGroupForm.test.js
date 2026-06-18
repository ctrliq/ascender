import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroupForm from './InventoryGroupForm';

const group = {
  id: 1,
  name: 'Foo',
  description: 'Bar',
  variables: 'ying: false',
};

describe('<InventoryGroupForm />', () => {
  test('should render values for the fields that have them', () => {
    renderWithContexts(
      <InventoryGroupForm
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        group={group}
      />
    );
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Foo');
    expect(screen.getByLabelText('Description')).toHaveValue('Bar');
    expect(screen.getByText('Variables')).toBeInTheDocument();
  });

  test('should throw error properly', () => {
    renderWithContexts(
      <InventoryGroupForm
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        group={group}
        error={{
          response: {
            config: {
              method: 'post',
              url: '/api/v2/groups/',
            },
            data: { detail: 'An error occurred' },
          },
        }}
      />
    );
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });
});
