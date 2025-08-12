import React from 'react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { en } from 'make-plural/plurals';
import english from '../../../locales/en/messages';
import { InventoriesAPI } from 'api';
import ConstructedInventorySyncButton from './ConstructedInventorySyncButton';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../api');

const inventory = { id: 100, name: 'Constructed Inventory' };

describe('<ConstructedInventorySyncButton />', () => {
  const Component = () => (
    <I18nProvider i18n={i18n}>
      <ConstructedInventorySyncButton inventoryId={inventory.id} />
    </I18nProvider>
  );

  beforeEach(() => {
    i18n.loadLocaleData({ en: { plurals: en } });
    i18n.load({ en: english });
    i18n.activate('en');
  });

  test('should render start sync button', () => {
    render(<Component />);
    expect(
      screen.getByRole('button', { name: 'Start inventory source sync' })
    ).toBeInTheDocument();
  });

  test('should make expected api request on sync', async () => {
    render(<Component />);
    const syncButton = screen.queryByText('Sync');
    fireEvent.click(syncButton);
    await waitFor(() =>
      expect(InventoriesAPI.syncAllSources).toHaveBeenCalledWith(100)
    );
  });

  test('should show alert modal on throw', async () => {
    InventoriesAPI.syncAllSources.mockRejectedValueOnce(new Error());
    render(<Component />);
    await waitFor(() => {
      const syncButton = screen.queryByText('Sync');
      fireEvent.click(syncButton);
    });
    expect(screen.getByRole('dialog', { name: 'Alert modal Error!' }));
  });
});
