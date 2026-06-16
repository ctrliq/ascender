import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ScheduleOccurrences from './ScheduleOccurrences';

describe('<ScheduleOccurrences>', () => {
  describe('At least two dates passed in', () => {
    function setup() {
      return renderWithContexts(
        <ScheduleOccurrences
          preview={{
            local: ['2020-03-16T00:00:00-04:00', '2020-03-30T00:00:00-04:00'],
            utc: ['2020-03-16T04:00:00Z', '2020-03-30T04:00:00Z'],
          }}
        />
      );
    }

    test('Local option initially set', () => {
      setup();
      // MultiButtonToggle marks the active option with the PF "primary" variant
      expect(screen.getByRole('button', { name: 'Local' })).toHaveClass(
        'pf-m-primary'
      );
      expect(screen.getByRole('button', { name: 'UTC' })).toHaveClass(
        'pf-m-secondary'
      );
    });

    test('It renders the correct number of dates', () => {
      const { container } = setup();
      const dd = container.querySelector('dd');
      expect(dd.children.length).toBe(2);
    });

    test('Clicking UTC button toggles the dates to utc', async () => {
      const { container, user } = setup();
      await user.click(screen.getByRole('button', { name: 'UTC' }));
      expect(screen.getByRole('button', { name: 'UTC' })).toHaveClass(
        'pf-m-primary'
      );
      const dd = container.querySelector('dd');
      expect(dd.children.length).toBe(2);
      // the time formatter uses a narrow no-break space (U+202F) before AM/PM
      expect(dd.children[0]).toHaveTextContent('3/16/2020, 4:00:00 AM');
      expect(dd.children[1]).toHaveTextContent('3/30/2020, 4:00:00 AM');
    });
  });

  describe('Only one date passed in', () => {
    test('Component should not render children', () => {
      const { container } = renderWithContexts(
        <ScheduleOccurrences
          preview={{
            local: ['2020-03-16T00:00:00-04:00'],
            utc: ['2020-03-16T04:00:00Z'],
          }}
        />
      );
      // component returns null when fewer than two local dates are provided
      expect(container).toBeEmptyDOMElement();
    });
  });
});
