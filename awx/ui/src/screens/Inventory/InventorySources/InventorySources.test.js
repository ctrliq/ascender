import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventorySources from './InventorySources';

// stub the leaf list so the index route renders without hitting the API
jest.mock('./InventorySourceList', () => {
  const InventorySourceList = () => <div data-testid="source-list" />;
  return { __esModule: true, default: InventorySourceList };
});

describe('<InventorySources />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(<InventorySources />);
    expect(screen.getByTestId('source-list')).toBeInTheDocument();
  });
});
