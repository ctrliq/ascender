import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import AdvancedInventoryHostDetail from './AdvancedInventoryHostDetail';
import mockHost from '../shared/data.host.json';

jest.mock('../../../api');

function renderAt(host) {
  const history = createMemoryHistory({
    initialEntries: ['/inventories/inventory/3/hosts/2/details'],
  });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/hosts/:hostId/details"
        element={<AdvancedInventoryHostDetail host={host} />}
      />
      <Route path="*" element={null} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
}

describe('<AdvancedInventoryHostDetail />', () => {
  test('should render Details', async () => {
    renderAt(mockHost);

    await screen.findByText('localhost');
    assertDetail('Name', 'localhost');
    assertDetail('Description', 'localhost description');
    assertDetail('Inventory', 'Mikes Inventory');
    assertDetail('Enabled', 'On');
    assertDetail('Created', '10/28/2019, 9:26:54 PM');
    assertDetail('Last modified', '10/29/2019, 8:18:41 PM');

    // Sparkline (Activity) renders its tooltip/status for the recent job.
    const activity = screen.getByText('Activity');
    expect(activity.nextElementSibling).not.toBeEmptyDOMElement();

    // react-ace VariablesDetail renders empty under jsdom, assert the label.
    expect(screen.getByText('Variables')).toBeInTheDocument();
  });

  test('should not load Activity', async () => {
    renderAt({
      ...mockHost,
      summary_fields: {
        recent_jobs: [],
        inventory: { kind: 'constructed', id: 2 },
      },
    });

    // With no recent jobs the Activity Detail renders nothing (isEmpty), so
    // the label is absent.
    await screen.findByText('localhost');
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
  });
});
