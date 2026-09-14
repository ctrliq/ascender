import React from 'react';
import { screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import SubscriptionDetail from './SubscriptionDetail';

const config = {
  me: {
    is_superuser: false,
  },
  version: '1.2.3',
  license_info: {
    compliant: true,
    current_instances: 1,
    date_expired: false,
    date_warning: true,
    free_instances: 1000,
    automated_instances: '12',
    automated_since: '1614714228',
    grace_period_remaining: 2904229,
    instance_count: 1001,
    license_date: '1614401999',
    license_type: 'enterprise',
    pool_id: '123',
    product_name: 'Red Hat Ansible Automation, Standard (5000 Managed Nodes)',
    satellite: false,
    sku: 'ABC',
    subscription_name:
      'Red Hat Ansible Automation, Standard (1001 Managed Nodes)',
    support_level: null,
    time_remaining: 312229,
    trial: false,
    valid_key: true,
  },
  systemConfig: {
    SUBSCRIPTION_USAGE_MODEL: 'unique_managed_hosts',
  },
};

describe('<SubscriptionDetail />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(<SubscriptionDetail />, { context: { config } });
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  test('should render expected details', () => {
    renderWithContexts(<SubscriptionDetail />, { context: { config } });

    const status = screen.getByText('Status');
    expect(status.nextElementSibling).toHaveTextContent('Compliant');
    expect(status.nextElementSibling).toHaveTextContent(
      'The number of hosts you have automated against is below your subscription count.'
    );
    assertDetail('Automation controller version', '1.2.3');
    assertDetail('Subscription type', 'enterprise');
    assertDetail(
      'Subscription',
      'Red Hat Ansible Automation, Standard (1001 Managed Nodes)'
    );
    assertDetail('Trial', 'False');
    assertDetail('Expires on', '2/27/2021, 4:59:59 AM');
    assertDetail('Days remaining', '3');
    assertDetail('Hosts imported', '1');
    assertDetail('Hosts remaining', '1000');
    assertDetail('Hosts automated', '12 since 3/2/2021, 7:43:48 PM');

    expect(
      screen.queryByRole('link', { name: 'edit' })
    ).not.toBeInTheDocument();
  });

  test('should render edit button for system admin', () => {
    renderWithContexts(<SubscriptionDetail />, {
      context: { config: { ...config, me: { is_superuser: true } } },
    });
    expect(screen.getByRole('link', { name: 'edit' })).toBeInTheDocument();
  });

  test('should not render Hosts Automated Detail if license_info.automated_instances is undefined', () => {
    renderWithContexts(<SubscriptionDetail />, {
      context: {
        config: {
          ...config,
          license_info: { ...config.license_info, automated_instances: null },
        },
      },
    });
    expect(screen.queryByText('Hosts automated')).not.toBeInTheDocument();
  });
});
