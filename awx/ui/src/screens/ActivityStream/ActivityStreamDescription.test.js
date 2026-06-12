import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import ActivityStreamDescription from './ActivityStreamDescription';

describe('ActivityStreamDescription', () => {
  test('initially renders successfully', () => {
    const description = mountWithContexts(
      <ActivityStreamDescription activity={{}} />
    );
    expect(description.find('span').length).toBe(1);
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
    };
    const description = mountWithContexts(
      <ActivityStreamDescription activity={activity} />
    );
    const link = description.find('Link');
    expect(link).toHaveLength(1);
    expect(link.prop('to')).toBe('/inventories/inventory/7/sources/3/schedules/5/');
    expect(link.text()).toBe('Sync Schedule');
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
    };
    const description = mountWithContexts(
      <ActivityStreamDescription activity={activity} />
    );
    expect(description.find('Link')).toHaveLength(0);
    expect(description.text()).toContain('Mystery Schedule');
  });
});
