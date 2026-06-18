import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { ConfigAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import SubscriptionModal from './SubscriptionModal';

jest.mock('../../../../api');

const mockSubscriptions = [
  {
    subscription_name: 'mock A',
    instance_count: 100,
    license_date: 1714000271,
    pool_id: 7,
  },
  {
    subscription_name: 'mock B',
    instance_count: 200,
    license_date: 1714000271,
    pool_id: 8,
  },
  {
    subscription_name: 'mock C',
    instance_count: 30,
    license_date: 1714000271,
    pool_id: 9,
  },
];

async function waitForLoaded() {
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
}

describe('<SubscriptionModal />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('with subscriptions', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    async function setup() {
      ConfigAPI.readSubscriptions = jest.fn().mockResolvedValue({
        data: mockSubscriptions.map((s) => ({ ...s })),
      });
      const utils = renderWithContexts(
        <SubscriptionModal
          subscriptionCreds={{ username: 'admin', password: '$encrypted' }}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      );
      await screen.findByText('mock A');
      return utils;
    }

    test('should render header', async () => {
      await setup();
      const headers = within(
        screen.getByRole('grid')
      ).getAllByRole('columnheader');
      expect(headers[1]).toHaveTextContent('Name');
      expect(headers[2]).toHaveTextContent('Managed nodes');
      expect(headers[3]).toHaveTextContent('Expires');
    });

    test('should render subscription rows', async () => {
      await setup();
      const rows = within(screen.getByRole('grid')).getAllByRole('row');
      // header row + 3 subscription rows
      expect(rows).toHaveLength(4);
      const firstRow = rows[1];
      expect(within(firstRow).getByRole('radio')).toBeInTheDocument();
      expect(firstRow).toHaveTextContent('mock A');
      expect(firstRow).toHaveTextContent('100');
      // the i18n date formatter separates time and meridiem with a narrow
      // no-break space (U+202F); match loosely so the space variant is ignored
      expect(firstRow).toHaveTextContent(/4\/24\/2024, 11:11:11\s?PM/);
    });

    test('submit button should call onConfirm', async () => {
      const { user } = await setup();
      const confirm = screen.getByRole('button', { name: 'Confirm selection' });
      expect(confirm).toBeDisabled();
      const rows = within(screen.getByRole('grid')).getAllByRole('row');
      await user.click(within(rows[1]).getByRole('radio'));
      expect(
        screen.getByRole('button', { name: 'Confirm selection' })
      ).not.toBeDisabled();
      expect(onConfirm).toHaveBeenCalledTimes(0);
      expect(onClose).toHaveBeenCalledTimes(0);
      await user.click(
        screen.getByRole('button', { name: 'Confirm selection' })
      );
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('should auto-select current selected subscription', async () => {
      ConfigAPI.readSubscriptions = jest.fn().mockResolvedValue({
        data: mockSubscriptions.map((s) => ({ ...s })),
      });
      renderWithContexts(
        <SubscriptionModal
          subscriptionCreds={{ username: 'admin', password: '$encrypted' }}
          selectedSubscription={{ id: 2 }}
        />
      );
      await screen.findByText('mock A');
      await waitFor(() =>
        expect(document.querySelector('tr[id="row-2"] input')).toBeChecked()
      );
      expect(document.querySelector('tr[id="row-1"] input')).not.toBeChecked();
      expect(document.querySelector('tr[id="row-3"] input')).not.toBeChecked();
    });
  });

  test('should show empty content', async () => {
    renderWithContexts(
      <SubscriptionModal subscriptionCreds={{ username: null, password: null }} />
    );
    expect(
      await screen.findByText('No subscriptions found')
    ).toBeInTheDocument();
  });

  test('should display error detail message', async () => {
    ConfigAPI.readSubscriptions = jest.fn().mockRejectedValueOnce(new Error());
    renderWithContexts(
      <SubscriptionModal
        subscriptionCreds={{ username: 'admin', password: '$encrypted' }}
      />
    );
    await waitForLoaded();
    expect(
      await screen.findByText('No subscriptions found')
    ).toBeInTheDocument();
    // the error branch additionally renders ErrorDetail (a "Details" toggle)
    expect(
      screen.getByText(
        'We were unable to locate licenses associated with this account.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
