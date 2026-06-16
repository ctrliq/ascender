import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ActivityStreamDescription from './ActivityStreamDescription';

describe('ActivityStreamDescription', () => {
  test('initially renders successfully', () => {
    const { container } = renderWithContexts(
      <ActivityStreamDescription activity={{}} />
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
    };
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
    };
    renderWithContexts(<ActivityStreamDescription activity={activity} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Mystery Schedule/)).toBeInTheDocument();
  });
});
