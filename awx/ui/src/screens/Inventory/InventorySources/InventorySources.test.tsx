import type { Inventory } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventorySources from './InventorySources';

// stub the leaf list so the index route renders without hitting the API
vi.mock('./InventorySourceList', () => {
  const InventorySourceList = () => <div data-testid="source-list" />;
  return { __esModule: true, default: InventorySourceList };
});

describe('<InventorySources />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(
      <InventorySources
        inventory={{ id: 1 } as Inventory}
        setBreadcrumb={() => {}}
      />
    );
    expect(screen.getByTestId('source-list')).toBeInTheDocument();
  });
});
