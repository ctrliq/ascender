import type { ActivityStreamEntry } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ActivityStreamDescription from './ActivityStreamDescription';

describe('ActivityStreamDescription', () => {
  test('initially renders successfully', () => {
    const { container } = renderWithContexts(
      <ActivityStreamDescription activity={{} as ActivityStreamEntry} />
    );
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });

  test('builds a link for an inventory source sync schedule', () => {
    const activity = {
      object_association: '',
      object_type: 'schedule',
      object1: 'schedule',
      object2: '',
      operation: 'create',
      changes: { id: 5, name: 'Sync Schedule' },
      summary_fields: {
        schedule: [{ id: 5, name: 'Sync Schedule' }],
        inventory_source: [{ id: 3, name: 'src', inventory_id: 7 }],
      },
    } as unknown as ActivityStreamEntry;
    renderWithContexts(<ActivityStreamDescription activity={activity} />);
    const link = screen.getByRole('link', { name: 'Sync Schedule' });
    expect(link).toHaveAttribute(
      'href',
      '/inventories/inventory/7/sources/3/schedules/5/'
    );
  });

  test('falls back to plain text for a schedule with an unknown parent', () => {
    const activity = {
      object_association: '',
      object_type: 'schedule',
      object1: 'schedule',
      object2: '',
      operation: 'create',
      changes: { id: 5, name: 'Mystery Schedule' },
      summary_fields: {
        schedule: [{ id: 5, name: 'Mystery Schedule' }],
      },
    } as unknown as ActivityStreamEntry;
    renderWithContexts(<ActivityStreamDescription activity={activity} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Mystery Schedule/)).toBeInTheDocument();
  });

  // One created object, named the way the stream names it, so each test below
  // is about the address built for its type.
  const created = (
    type: string,
    ref: Record<string, unknown>,
    changes: Record<string, unknown> = ref
  ) =>
    ({
      object_association: '',
      object_type: type,
      object1: type,
      object2: '',
      operation: 'create',
      changes,
      summary_fields: { [type]: [ref] },
    }) as unknown as ActivityStreamEntry;

  test.each([
    [{ name: 'CUSTOM_LOGO', category: 'ui' }, '/appearance'],
    [
      { name: 'LOCAL_PASSWORD_MIN_DIGITS', category: 'authentication' },
      '/authentication/password',
    ],
    [
      { name: 'OAUTH2_PROVIDER', category: 'authentication' },
      '/authentication/tokens',
    ],
    [
      { name: 'SOCIAL_AUTH_TEAM_MAP', category: 'authentication' },
      '/authentication/mapping',
    ],
    [
      { name: 'SESSION_COOKIE_AGE', category: 'authentication' },
      '/authentication/session',
    ],
    [
      { name: 'SOCIAL_AUTH_GITHUB_ORG_KEY', category: 'github-org' },
      '/authentication/github',
    ],
    [
      { name: 'AUTH_LDAP_SERVER_URI', category: 'ldap' },
      '/authentication/ldap',
    ],
    [{ name: 'AWX_TASK_ENV', category: 'jobs' }, '/job_settings'],
    [{ name: 'LOG_AGGREGATOR_HOST', category: 'logging' }, '/logging'],
    [{ name: 'TOWER_URL_BASE', category: 'system' }, '/system'],
    [{ name: 'RECEPTOR_RELEASE_WORK', category: 'debug' }, '/troubleshooting'],
  ])('links setting %o to the page it is on', (setting, href) => {
    renderWithContexts(
      <ActivityStreamDescription
        // As the api writes a created setting: its change set holds only the
        // value and id, so the name has to come from the summary field.
        activity={created('setting', setting, { id: 1, value: 0 })}
      />
    );
    expect(screen.getByRole('link', { name: setting.name })).toHaveAttribute(
      'href',
      href
    );
  });

  test('names a setting no page shows without a link', () => {
    renderWithContexts(
      <ActivityStreamDescription
        activity={created(
          'setting',
          { name: 'BULK_JOB_MAX_LAUNCH', category: 'bulk' },
          { id: 1, value: 100 }
        )}
      />
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/BULK_JOB_MAX_LAUNCH/)).toBeInTheDocument();
  });

  test('links a command run to its place among the runs', () => {
    renderWithContexts(
      <ActivityStreamDescription
        activity={created('ad_hoc_command', { id: 9, name: 'ping' })}
      />
    );
    expect(screen.getByRole('link', { name: 'ping' })).toHaveAttribute(
      'href',
      '/runs/command/9/details'
    );
  });

  test('names an inventory script without a link', () => {
    renderWithContexts(
      <ActivityStreamDescription
        activity={created('custom_inventory_script', {
          id: 2,
          name: 'old script',
        })}
      />
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test.each([
    [true, '/container_groups/4/details'],
    [false, '/instance_groups/4/details'],
  ])('links a group with is_container_group %s to %s', (isContainer, href) => {
    renderWithContexts(
      <ActivityStreamDescription
        activity={created('instance_group', {
          id: 4,
          name: 'grp',
          is_container_group: isContainer,
        })}
      />
    );
    expect(screen.getByRole('link', { name: 'grp' })).toHaveAttribute(
      'href',
      href
    );
  });

  test('links a sent notification to the template that sent it', () => {
    renderWithContexts(
      <ActivityStreamDescription
        activity={created('notification', {
          id: 12,
          notification_type: 'slack',
          notification_template_id: 3,
        })}
      />
    );
    expect(screen.getByRole('link', { name: 'slack #12' })).toHaveAttribute(
      'href',
      '/notifications/3/details'
    );
  });

  test('links an access token under the user it belongs to', () => {
    renderWithContexts(
      <ActivityStreamDescription
        activity={created('o_auth2_access_token', {
          id: 8,
          user_id: 2,
          description: 'ci token',
        })}
      />
    );
    expect(screen.getByRole('link', { name: 'ci token' })).toHaveAttribute(
      'href',
      '/users/2/tokens/8/details'
    );
  });

  test.each([['workflow_job_node'], ['receptor_address'], ['unified_job']])(
    'names a %s without inventing an address for it',
    (type) => {
      renderWithContexts(
        <ActivityStreamDescription
          activity={created(type, { id: 1, name: 'thing' })}
        />
      );
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText('thing')).toBeInTheDocument();
    }
  );

  test('still links a user at its own screen', () => {
    renderWithContexts(
      <ActivityStreamDescription
        activity={created('user', { id: 5, username: 'bob' })}
      />
    );
    expect(screen.getByRole('link', { name: 'bob' })).toHaveAttribute(
      'href',
      '/users/5/'
    );
  });
});
